// MathBoard
//
// Copyright (C) 2026 Giacomo Bartoloni
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
// Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.

//! Same-user, bounded production IPC over a private Unix socket.

use crate::board_bridge::BoardRequestBroker;
use crate::mcp_ipc_protocol::{
    IpcReply, REQUEST_LIMIT, read_command, read_reply, write_frame, write_reply,
};
use crate::mcp_native;
use serde_json::Value;
use socket2::{Domain, SockAddr, Socket, Type};
use std::collections::HashMap;
use std::fs::{self, DirBuilder, File, OpenOptions, Permissions};
use std::io::{self, Read, Write};
use std::net::Shutdown;
use std::os::fd::AsRawFd;
use std::os::unix::fs::{DirBuilderExt, FileTypeExt, MetadataExt, OpenOptionsExt, PermissionsExt};
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};
use tauri::Manager;

const MAX_CONNECTIONS: usize = 4;
const FRAME_DEADLINE: Duration = Duration::from_secs(2);

struct DeadlineIo<'a> {
    stream: &'a mut UnixStream,
    deadline: Instant,
}
impl<'a> DeadlineIo<'a> {
    fn new(stream: &'a mut UnixStream, duration: Duration) -> Self {
        Self {
            stream,
            deadline: Instant::now() + duration,
        }
    }
    fn remaining(&self) -> io::Result<Duration> {
        let duration = self.deadline.saturating_duration_since(Instant::now());
        if duration.is_zero() {
            Err(io::Error::from(io::ErrorKind::TimedOut))
        } else {
            Ok(duration)
        }
    }
}
impl Read for DeadlineIo<'_> {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        self.stream.set_read_timeout(Some(self.remaining()?))?;
        self.stream.read(buf)
    }
}
impl Write for DeadlineIo<'_> {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        self.stream.set_write_timeout(Some(self.remaining()?))?;
        self.stream.write(buf)
    }
    fn flush(&mut self) -> io::Result<()> {
        self.stream.flush()
    }
}

fn uid() -> u32 {
    unsafe { libc::geteuid() }
}

fn directory() -> PathBuf {
    PathBuf::from("/tmp").join(format!("mathboard-mcp-{}", uid()))
}
fn socket(dir: &Path) -> PathBuf {
    dir.join("broker-v1.sock")
}
fn lock_path(dir: &Path) -> PathBuf {
    dir.join("broker-v1.lock")
}

fn checked_dir(path: &Path, create: bool) -> io::Result<()> {
    if create {
        match DirBuilder::new().mode(0o700).create(path) {
            Ok(()) => (),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => (),
            Err(error) => return Err(error),
        }
    }
    let metadata = fs::symlink_metadata(path)?;
    if !metadata.is_dir()
        || metadata.uid() != uid()
        || metadata.mode() & 0o777 != 0o700
        || metadata.nlink() < 2
    {
        return Err(io::Error::from(io::ErrorKind::PermissionDenied));
    }
    Ok(())
}

fn checked_socket(path: &Path) -> io::Result<fs::Metadata> {
    let metadata = fs::symlink_metadata(path)?;
    if !metadata.file_type().is_socket()
        || metadata.uid() != uid()
        || metadata.mode() & 0o777 != 0o600
        || metadata.nlink() != 1
    {
        return Err(io::Error::from(io::ErrorKind::PermissionDenied));
    }
    Ok(metadata)
}

#[cfg(target_os = "linux")]
fn peer_uid(stream: &UnixStream) -> io::Result<u32> {
    let mut credentials: libc::ucred = unsafe { std::mem::zeroed() };
    let mut length = std::mem::size_of::<libc::ucred>() as libc::socklen_t;
    let result = unsafe {
        libc::getsockopt(
            stream.as_raw_fd(),
            libc::SOL_SOCKET,
            libc::SO_PEERCRED,
            (&mut credentials as *mut libc::ucred).cast(),
            &mut length,
        )
    };
    if result != 0 || length as usize != std::mem::size_of::<libc::ucred>() {
        return Err(io::Error::last_os_error());
    }
    Ok(credentials.uid)
}

#[cfg(not(target_os = "linux"))]
fn peer_uid(stream: &UnixStream) -> io::Result<u32> {
    unsafe extern "C" {
        fn getpeereid(
            socket: libc::c_int,
            euid: *mut libc::uid_t,
            egid: *mut libc::gid_t,
        ) -> libc::c_int;
    }
    let mut peer = 0;
    let mut group = 0;
    if unsafe { getpeereid(stream.as_raw_fd(), &mut peer, &mut group) } != 0 {
        return Err(io::Error::last_os_error());
    }
    Ok(peer)
}

fn ownership_lock(dir: &Path) -> io::Result<File> {
    let file = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .mode(0o600)
        .custom_flags(libc::O_NOFOLLOW | libc::O_CLOEXEC)
        .open(lock_path(dir))?;
    let metadata = file.metadata()?;
    if !metadata.is_file()
        || metadata.uid() != uid()
        || metadata.mode() & 0o777 != 0o600
        || metadata.nlink() != 1
    {
        return Err(io::Error::from(io::ErrorKind::PermissionDenied));
    }
    if unsafe { libc::flock(file.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) } != 0 {
        let error = io::Error::last_os_error();
        return Err(if error.kind() == io::ErrorKind::WouldBlock {
            io::Error::from(io::ErrorKind::AddrInUse)
        } else {
            error
        });
    }
    Ok(file)
}

fn bind(dir: &Path) -> io::Result<(UnixListener, fs::Metadata, File)> {
    checked_dir(dir, true)?;
    let owner = ownership_lock(dir)?;
    let path = socket(dir);
    if let Ok(metadata) = fs::symlink_metadata(&path) {
        if !metadata.file_type().is_socket() || metadata.uid() != uid() || metadata.nlink() != 1 {
            return Err(io::Error::from(io::ErrorKind::PermissionDenied));
        }
        fs::remove_file(&path)?;
    }
    let listener = UnixListener::bind(&path)?;
    fs::set_permissions(&path, Permissions::from_mode(0o600))?;
    let metadata = checked_socket(&path)?;
    listener.set_nonblocking(true)?;
    Ok((listener, metadata, owner))
}

struct ActiveConnection {
    count: Arc<AtomicUsize>,
    streams: Arc<Mutex<HashMap<usize, UnixStream>>>,
    id: usize,
}
impl Drop for ActiveConnection {
    fn drop(&mut self) {
        self.streams
            .lock()
            .expect("MCP stream lock poisoned")
            .remove(&self.id);
        self.count.fetch_sub(1, Ordering::AcqRel);
    }
}

fn serve_one(mut stream: UnixStream, app: tauri::AppHandle, _active: ActiveConnection) {
    if peer_uid(&stream).ok() != Some(uid()) {
        return;
    }
    let Ok(command) = read_command(&mut DeadlineIo::new(&mut stream, FRAME_DEADLINE)) else {
        return;
    };
    let broker = app.state::<BoardRequestBroker>();
    let mut reply = mcp_native::dispatch(&app, &broker, command);
    if let IpcReply::ReadJson { lease, .. } | IpcReply::ReadPng { lease, .. } = &reply {
        if !broker.mcp_lease_valid(lease) {
            reply = IpcReply::Error {
                code: "permission_denied".into(),
            };
        }
    }
    let lease = match &reply {
        IpcReply::ReadJson { lease, .. } | IpcReply::ReadPng { lease, .. } => Some(lease.clone()),
        _ => None,
    };
    if write_reply(&mut DeadlineIo::new(&mut stream, FRAME_DEADLINE), &reply).is_err() {
        if let Some(lease) = lease {
            broker.mcp_release_lease(&lease);
        }
    }
}

pub fn connect(deadline: Instant) -> io::Result<UnixStream> {
    let dir = directory();
    checked_dir(&dir, false)?;
    checked_socket(&socket(&dir))?;
    let remaining = deadline.saturating_duration_since(Instant::now());
    if remaining.is_zero() {
        return Err(io::Error::from(io::ErrorKind::TimedOut));
    }
    let client = Socket::new(Domain::UNIX, Type::STREAM, None)?;
    client.connect_timeout(&SockAddr::unix(socket(&dir))?, remaining)?;
    let stream: UnixStream = client.into();
    if peer_uid(&stream)? != uid() {
        return Err(io::Error::from(io::ErrorKind::PermissionDenied));
    }
    Ok(stream)
}

pub fn exchange(request: Value) -> io::Result<IpcReply> {
    let deadline = Instant::now() + Duration::from_secs(12);
    let mut stream = connect(deadline)?;
    write_frame(
        &mut DeadlineIo {
            stream: &mut stream,
            deadline: deadline.min(Instant::now() + FRAME_DEADLINE),
        },
        &request,
        REQUEST_LIMIT,
    )?;
    read_reply(&mut DeadlineIo {
        stream: &mut stream,
        deadline,
    })
}

pub struct UnixMcpServer {
    stop: Arc<AtomicBool>,
    worker: Mutex<Option<JoinHandle<()>>>,
    app: tauri::AppHandle,
    dir: PathBuf,
    socket_identity: (u64, u64),
    streams: Arc<Mutex<HashMap<usize, UnixStream>>>,
    _owner: File,
}

impl UnixMcpServer {
    pub fn start(app: tauri::AppHandle) -> io::Result<Self> {
        let dir = directory();
        let (listener, metadata, owner) = bind(&dir)?;
        let stop = Arc::new(AtomicBool::new(false));
        let active = Arc::new(AtomicUsize::new(0));
        let streams = Arc::new(Mutex::new(HashMap::new()));
        let worker_streams = Arc::clone(&streams);
        let worker_stop = Arc::clone(&stop);
        let worker_app = app.clone();
        let worker = thread::Builder::new()
            .name("mathboard-mcp-ipc".into())
            .spawn(move || {
                let mut connections: Vec<JoinHandle<()>> = Vec::new();
                let mut next_connection = 0usize;
                while !worker_stop.load(Ordering::Acquire) {
                    let mut index = 0;
                    while index < connections.len() {
                        if connections[index].is_finished() {
                            let _ = connections.swap_remove(index).join();
                        } else {
                            index += 1;
                        }
                    }
                    match listener.accept() {
                        Ok((stream, _)) => {
                            if worker_stop.load(Ordering::Acquire)
                                || active.load(Ordering::Acquire) >= MAX_CONNECTIONS
                            {
                                continue;
                            }
                            let Ok(shutdown_stream) = stream.try_clone() else {
                                continue;
                            };
                            next_connection = next_connection.wrapping_add(1);
                            let id = next_connection;
                            worker_streams
                                .lock()
                                .expect("MCP stream lock poisoned")
                                .insert(id, shutdown_stream);
                            active.fetch_add(1, Ordering::AcqRel);
                            let guard = ActiveConnection {
                                count: Arc::clone(&active),
                                streams: Arc::clone(&worker_streams),
                                id,
                            };
                            let app = worker_app.clone();
                            match thread::Builder::new()
                                .name("mathboard-mcp-call".into())
                                .spawn(move || serve_one(stream, app, guard))
                            {
                                Ok(worker) => connections.push(worker),
                                Err(_) => {}
                            }
                        }
                        Err(error) if error.kind() == io::ErrorKind::WouldBlock => {
                            thread::sleep(Duration::from_millis(20))
                        }
                        Err(_) => break,
                    }
                }
                for worker in connections {
                    let _ = worker.join();
                }
            })?;
        Ok(Self {
            stop,
            worker: Mutex::new(Some(worker)),
            app,
            dir,
            socket_identity: (metadata.dev(), metadata.ino()),
            streams,
            _owner: owner,
        })
    }

    pub fn shutdown(&self) {
        if self.stop.swap(true, Ordering::AcqRel) {
            return;
        }
        self.app
            .state::<BoardRequestBroker>()
            .mcp_set_enabled(false);
        if let Ok(streams) = self.streams.lock() {
            for stream in streams.values() {
                let _ = stream.shutdown(Shutdown::Both);
            }
        }
        if let Ok(mut worker) = self.worker.lock() {
            if let Some(worker) = worker.take() {
                let _ = worker.join();
            }
        }
        let path = socket(&self.dir);
        if let Ok(metadata) = checked_socket(&path) {
            if (metadata.dev(), metadata.ino()) == self.socket_identity {
                let _ = fs::remove_file(path);
            }
        }
        // Keep the lock inode stable across restarts; deleting it would allow
        // another process to lock a replacement while this instance still owns it.
    }
}

impl Drop for UnixMcpServer {
    fn drop(&mut self) {
        self.shutdown();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn socket_is_private_and_duplicate_listener_is_rejected() {
        let dir =
            PathBuf::from("/tmp").join(format!("mathboard-mcp-test-{}", uuid::Uuid::new_v4()));
        let (listener, metadata, owner) = bind(&dir).unwrap();
        assert_eq!(metadata.mode() & 0o777, 0o600);
        assert_eq!(fs::metadata(&dir).unwrap().mode() & 0o777, 0o700);
        assert!(matches!(bind(&dir), Err(error) if error.kind() == io::ErrorKind::AddrInUse));
        let client = UnixStream::connect(socket(&dir)).unwrap();
        let (server, _) = listener.accept().unwrap();
        assert_eq!(peer_uid(&client).unwrap(), uid());
        assert_eq!(peer_uid(&server).unwrap(), uid());
        drop(server);
        drop(client);
        drop(listener);
        fs::remove_file(socket(&dir)).unwrap();
        drop(owner);
        fs::remove_file(lock_path(&dir)).unwrap();
        fs::remove_dir(dir).unwrap();
    }

    #[test]
    fn slow_partial_frame_cannot_extend_absolute_deadline() {
        let (mut sender, mut receiver) = UnixStream::pair().unwrap();
        let worker = thread::spawn(move || {
            for byte in [0u8; 4] {
                if sender.write_all(&[byte]).is_err() {
                    break;
                }
                thread::sleep(Duration::from_millis(30));
            }
        });
        let started = Instant::now();
        let mut prefix = [0u8; 4];
        let result =
            DeadlineIo::new(&mut receiver, Duration::from_millis(55)).read_exact(&mut prefix);
        assert!(result.is_err());
        assert!(started.elapsed() < Duration::from_millis(180));
        drop(receiver);
        worker.join().unwrap();
    }
}

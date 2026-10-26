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
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
// Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

//! Phase C feasibility-only PING/PONG socket, opt-in behind a Cargo feature.
//! The probe transports no board data, MCP methods, or authentication grants.

#[cfg(unix)]
mod unix {
    use std::fs::{self, DirBuilder, Permissions};
    use std::io::{self, Read, Write};
    use std::os::unix::fs::{DirBuilderExt, FileTypeExt, MetadataExt, PermissionsExt};
    use std::os::unix::net::{UnixListener, UnixStream};
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{Arc, Mutex};
    use std::thread::{self, JoinHandle};
    use std::time::Duration;

    unsafe extern "C" {
        fn geteuid() -> u32;
    }

    fn user_id() -> u32 {
        // OS credential rather than spoofable USER/UID environment variables.
        unsafe { geteuid() }
    }

    fn socket_dir() -> PathBuf {
        // macOS's per-user TMPDIR is often longer than the Unix SUN_LEN limit.
        // /tmp is system-managed; the checked 0700 child directory is private.
        PathBuf::from("/tmp").join(format!("mathboard-c-probe-{}", user_id()))
    }

    fn checked_directory(path: &Path) -> io::Result<()> {
        match DirBuilder::new().mode(0o700).create(path) {
            Ok(()) => (),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => (),
            Err(error) => return Err(error),
        }
        let meta = fs::symlink_metadata(path)?;
        if !meta.is_dir() || meta.uid() != user_id() || meta.mode() & 0o777 != 0o700 {
            return Err(io::Error::new(
                io::ErrorKind::PermissionDenied,
                "probe directory must belong to the effective OS user with mode 0700",
            ));
        }
        Ok(())
    }

    fn socket_path(dir: &Path) -> PathBuf {
        dir.join("companion.sock")
    }

    fn ping_at(dir: &Path) -> io::Result<()> {
        // A closed app must not create any directory as a side effect.
        let dir_meta = fs::symlink_metadata(dir)?;
        if !dir_meta.is_dir() || dir_meta.uid() != user_id() || dir_meta.mode() & 0o777 != 0o700 {
            return Err(io::Error::new(
                io::ErrorKind::PermissionDenied,
                "unsafe probe directory",
            ));
        }
        let socket = socket_path(dir);
        let meta = fs::symlink_metadata(&socket)?;
        if !meta.file_type().is_socket() || meta.uid() != user_id() || meta.mode() & 0o777 != 0o600
        {
            return Err(io::Error::new(
                io::ErrorKind::PermissionDenied,
                "unsafe probe socket",
            ));
        }
        let mut stream = UnixStream::connect(socket)?;
        stream.set_read_timeout(Some(Duration::from_secs(2)))?;
        stream.set_write_timeout(Some(Duration::from_secs(2)))?;
        stream.write_all(b"PING\n")?;
        let mut reply = [0; 5];
        stream.read_exact(&mut reply)?;
        if reply != *b"PONG\n" {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "invalid companion probe reply",
            ));
        }
        Ok(())
    }

    pub fn ping() -> io::Result<()> {
        ping_at(&socket_dir())
    }

    pub struct ProbeServer {
        stop: Arc<AtomicBool>,
        worker: Mutex<Option<JoinHandle<()>>>,
        dir: PathBuf,
    }

    impl ProbeServer {
        pub fn start() -> io::Result<Self> {
            Self::start_at(socket_dir())
        }

        fn start_at(dir: PathBuf) -> io::Result<Self> {
            checked_directory(&dir)?;
            let path = socket_path(&dir);
            if let Ok(meta) = fs::symlink_metadata(&path) {
                if !meta.file_type().is_socket() || meta.uid() != user_id() {
                    return Err(io::Error::new(
                        io::ErrorKind::PermissionDenied,
                        "unsafe stale socket",
                    ));
                }
                if UnixStream::connect(&path).is_ok() {
                    return Err(io::Error::new(
                        io::ErrorKind::AddrInUse,
                        "probe already running",
                    ));
                }
                fs::remove_file(&path)?;
            }
            let listener = UnixListener::bind(&path)?;
            fs::set_permissions(&path, Permissions::from_mode(0o600))?;
            listener.set_nonblocking(true)?;
            let stop = Arc::new(AtomicBool::new(false));
            let stop_thread = Arc::clone(&stop);
            let worker = thread::spawn(move || {
                while !stop_thread.load(Ordering::Relaxed) {
                    match listener.accept() {
                        Ok((mut stream, _)) => {
                            let _ = stream.set_read_timeout(Some(Duration::from_secs(1)));
                            let _ = stream.set_write_timeout(Some(Duration::from_secs(1)));
                            let mut request = [0; 5];
                            if stream.read_exact(&mut request).is_ok() && request == *b"PING\n" {
                                let _ = stream.write_all(b"PONG\n");
                            }
                        }
                        Err(error) if error.kind() == io::ErrorKind::WouldBlock => {
                            thread::sleep(Duration::from_millis(30));
                        }
                        Err(_) => break,
                    }
                }
            });
            Ok(Self {
                stop,
                worker: Mutex::new(Some(worker)),
                dir,
            })
        }
    }

    impl ProbeServer {
        /// Called by the Tauri exit event: Tauri can exit without dropping managed state.
        /// Safe to invoke again from Drop or after a previous shutdown.
        pub fn shutdown(&self) {
            self.stop.store(true, Ordering::Relaxed);
            if let Ok(mut worker) = self.worker.lock() {
                if let Some(worker) = worker.take() {
                    let _ = worker.join();
                }
            }
            let path = socket_path(&self.dir);
            if let Ok(meta) = fs::symlink_metadata(&path) {
                if meta.file_type().is_socket() && meta.uid() == user_id() {
                    let _ = fs::remove_file(&path);
                }
            }
            let _ = fs::remove_dir(&self.dir);
        }
    }

    impl Drop for ProbeServer {
        fn drop(&mut self) {
            self.shutdown();
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        fn temp_dir() -> PathBuf {
            PathBuf::from("/tmp").join(format!("mathboard-c-ipc-test-{}", uuid::Uuid::new_v4()))
        }

        #[test]
        fn ping_round_trip_and_cleanup() {
            let dir = temp_dir();
            let server = ProbeServer::start_at(dir.clone()).unwrap();
            assert_eq!(fs::metadata(&dir).unwrap().mode() & 0o777, 0o700);
            assert_eq!(
                fs::metadata(socket_path(&dir)).unwrap().mode() & 0o777,
                0o600
            );
            ping_at(&dir).unwrap();
            assert!(
                matches!(ProbeServer::start_at(dir.clone()), Err(e) if e.kind() == io::ErrorKind::AddrInUse)
            );
            drop(server);
            assert!(!socket_path(&dir).exists());
        }

        #[test]
        fn explicit_app_exit_removes_socket_and_allows_restart() {
            let dir = temp_dir();
            let server = ProbeServer::start_at(dir.clone()).unwrap();
            ping_at(&dir).unwrap();

            server.shutdown();
            server.shutdown();
            assert!(!socket_path(&dir).exists());
            assert!(ping_at(&dir).is_err());

            let restarted = ProbeServer::start_at(dir.clone()).unwrap();
            ping_at(&dir).unwrap();
            restarted.shutdown();
            assert!(!socket_path(&dir).exists());
            drop(restarted);
            drop(server);
        }

        #[test]
        fn unsafe_directory_is_rejected() {
            let dir = temp_dir();
            fs::create_dir(&dir).unwrap();
            fs::set_permissions(&dir, Permissions::from_mode(0o755)).unwrap();
            assert!(
                matches!(ProbeServer::start_at(dir.clone()), Err(e) if e.kind() == io::ErrorKind::PermissionDenied)
            );
            fs::remove_dir(dir).unwrap();
        }
    }
}

#[cfg(unix)]
pub use unix::{ProbeServer, ping};

#[cfg(not(unix))]
pub fn ping() -> std::io::Result<()> {
    Err(std::io::Error::new(
        std::io::ErrorKind::Unsupported,
        "Windows named-pipe Phase C feasibility is not implemented",
    ))
}

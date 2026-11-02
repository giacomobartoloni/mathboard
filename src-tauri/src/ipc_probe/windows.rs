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

//! Local, same-user Windows feasibility probe. No board access or MCP parser.

use std::ffi::c_void;
use std::io;
use std::mem::{size_of, zeroed};
use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};
use std::ptr::{null, null_mut};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};
use windows_sys::Win32::Foundation::{
    ERROR_IO_PENDING, ERROR_NO_DATA, ERROR_PIPE_BUSY, ERROR_PIPE_CONNECTED, GENERIC_READ,
    GENERIC_WRITE, HANDLE, INVALID_HANDLE_VALUE, LocalFree, WAIT_OBJECT_0, WAIT_TIMEOUT,
};
use windows_sys::Win32::Security::Authorization::{
    ConvertSidToStringSidW, ConvertStringSecurityDescriptorToSecurityDescriptorW, SDDL_REVISION_1,
};
use windows_sys::Win32::Security::{
    GetTokenInformation, RevertToSelf, SECURITY_ATTRIBUTES, TOKEN_QUERY, TOKEN_USER, TokenUser,
};
use windows_sys::Win32::Storage::FileSystem::{
    CreateFileW, FILE_FLAG_FIRST_PIPE_INSTANCE, FILE_FLAG_OVERLAPPED, OPEN_EXISTING,
    PIPE_ACCESS_DUPLEX, ReadFile, SECURITY_IDENTIFICATION, SECURITY_SQOS_PRESENT, WriteFile,
};
use windows_sys::Win32::System::IO::{CancelIoEx, GetOverlappedResult, OVERLAPPED};
use windows_sys::Win32::System::Pipes::{
    ConnectNamedPipe, CreateNamedPipeW, DisconnectNamedPipe, GetNamedPipeServerProcessId,
    ImpersonateNamedPipeClient, PIPE_READMODE_MESSAGE, PIPE_REJECT_REMOTE_CLIENTS,
    PIPE_TYPE_MESSAGE, PIPE_WAIT, SetNamedPipeHandleState, WaitNamedPipeW,
};
use windows_sys::Win32::System::Threading::{
    CreateEventW, GetCurrentProcess, GetCurrentThread, OpenProcess, OpenProcessToken,
    OpenThreadToken, PROCESS_QUERY_LIMITED_INFORMATION, SetEvent, WaitForMultipleObjects,
    WaitForSingleObject,
};

const REQUEST: &[u8] = b"MATHBOARD-C-PROBE/1 PING\n";
const REPLY: &[u8] = b"MATHBOARD-C-PROBE/1 PONG\n";
const ACK: &[u8] = b"ACK/1\n";
const CLIENT_DEADLINE: Duration = Duration::from_secs(2);
const SERVER_DEADLINE: Duration = Duration::from_secs(1);

fn wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(Some(0)).collect()
}

fn owned(handle: HANDLE) -> io::Result<OwnedHandle> {
    if handle.is_null() || handle == INVALID_HANDLE_VALUE {
        Err(io::Error::last_os_error())
    } else {
        // SAFETY: the caller transfers a newly created, uniquely owned handle.
        Ok(unsafe { OwnedHandle::from_raw_handle(handle) })
    }
}

struct LocalAllocation(*mut c_void);
impl Drop for LocalAllocation {
    fn drop(&mut self) {
        // SAFETY: these allocations come only from the documented LocalFree APIs.
        unsafe { LocalFree(self.0) };
    }
}

fn token_sid(token: &OwnedHandle) -> io::Result<String> {
    let mut needed = 0;
    // SAFETY: the first call only asks Windows for the required buffer length.
    unsafe { GetTokenInformation(token.as_raw_handle(), TokenUser, null_mut(), 0, &mut needed) };
    if needed < size_of::<TOKEN_USER>() as u32 {
        return Err(io::Error::last_os_error());
    }
    // usize storage aligns TOKEN_USER, unlike a byte buffer cast to TOKEN_USER.
    let mut storage = vec![0usize; (needed as usize).div_ceil(size_of::<usize>())];
    // SAFETY: the aligned buffer is valid for the size returned by Windows.
    if unsafe {
        GetTokenInformation(
            token.as_raw_handle(),
            TokenUser,
            storage.as_mut_ptr().cast(),
            needed,
            &mut needed,
        )
    } == 0
    {
        return Err(io::Error::last_os_error());
    }
    let mut text = null_mut();
    // SAFETY: TOKEN_USER and its SID remain alive in storage throughout conversion.
    let user = unsafe { &*storage.as_ptr().cast::<TOKEN_USER>() };
    if unsafe { ConvertSidToStringSidW(user.User.Sid, &mut text) } == 0 {
        return Err(io::Error::last_os_error());
    }
    let allocation = LocalAllocation(text.cast());
    let mut length = 0;
    // SAFETY: ConvertSidToStringSidW returns a NUL-terminated SID string.
    unsafe {
        while *text.add(length) != 0 {
            length += 1;
        }
        let result = String::from_utf16_lossy(std::slice::from_raw_parts(text, length));
        drop(allocation);
        Ok(result)
    }
}

fn process_sid(process: HANDLE) -> io::Result<String> {
    let mut token = null_mut();
    // SAFETY: a valid process handle is queried for a new owned token handle.
    if unsafe { OpenProcessToken(process, TOKEN_QUERY, &mut token) } == 0 {
        return Err(io::Error::last_os_error());
    }
    token_sid(&owned(token)?)
}

fn current_sid() -> io::Result<String> {
    // SAFETY: GetCurrentProcess returns a pseudo-handle which is not owned/closed.
    process_sid(unsafe { GetCurrentProcess() })
}

fn endpoint(sid: &str) -> String {
    format!(r"\\.\pipe\mathboard-c-probe-v1-{sid}")
}

fn event() -> io::Result<OwnedHandle> {
    // SAFETY: unnamed, manual-reset, non-inheritable event with default security.
    owned(unsafe { CreateEventW(null(), 1, 0, null()) })
}

fn milliseconds(duration: Duration) -> u32 {
    duration.as_millis().clamp(1, (u32::MAX - 1) as u128) as u32
}

/// Keeps every OVERLAPPED, event and caller buffer alive until completion,
/// including after cancellation. Closing/freeing them immediately after
/// CancelIoEx would leave Windows writing into freed memory.
fn operation(
    pipe: &OwnedHandle,
    stop: Option<&OwnedHandle>,
    timeout: Duration,
    connecting: bool,
    begin: impl FnOnce(*mut OVERLAPPED, *mut u32) -> i32,
) -> io::Result<usize> {
    if timeout.is_zero() {
        return Err(io::Error::from(io::ErrorKind::TimedOut));
    }
    if let Some(stop) = stop {
        // SAFETY: a zero-time wait only observes the valid shutdown event.
        if unsafe { WaitForSingleObject(stop.as_raw_handle(), 0) } == WAIT_OBJECT_0 {
            return Err(io::Error::from(io::ErrorKind::Interrupted));
        }
    }
    let completed = event()?;
    // SAFETY: zero is the documented initialization for an OVERLAPPED.
    let mut pending: Box<OVERLAPPED> = Box::new(unsafe { zeroed() });
    pending.hEvent = completed.as_raw_handle();
    let mut transferred = 0;
    if begin(&mut *pending, &mut transferred) != 0 {
        return Ok(transferred as usize);
    }
    let error = io::Error::last_os_error();
    if connecting && error.raw_os_error() == Some(ERROR_PIPE_CONNECTED as i32) {
        return Ok(0);
    }
    if error.raw_os_error() != Some(ERROR_IO_PENDING as i32) {
        return Err(error);
    }
    let handles = match stop {
        Some(stop) => vec![stop.as_raw_handle(), completed.as_raw_handle()],
        None => vec![completed.as_raw_handle()],
    };
    // SAFETY: all event handles and the boxed operation outlive this wait.
    let waited = unsafe {
        WaitForMultipleObjects(
            handles.len() as u32,
            handles.as_ptr(),
            0,
            milliseconds(timeout),
        )
    };
    if waited == WAIT_OBJECT_0 + (handles.len() - 1) as u32 {
        // SAFETY: the event signals that the operation is complete.
        if unsafe { GetOverlappedResult(pipe.as_raw_handle(), &*pending, &mut transferred, 0) } == 0
        {
            return Err(io::Error::last_os_error());
        }
        return Ok(transferred as usize);
    }
    let error = if waited == WAIT_TIMEOUT {
        io::Error::from(io::ErrorKind::TimedOut)
    } else if stop.is_some() && waited == WAIT_OBJECT_0 {
        io::Error::from(io::ErrorKind::Interrupted)
    } else {
        io::Error::last_os_error()
    };
    // SAFETY: cancel this exact operation and drain its completion before the
    // boxed state, event, or begin closure's borrowed buffer can be dropped.
    unsafe {
        CancelIoEx(pipe.as_raw_handle(), &*pending);
        GetOverlappedResult(pipe.as_raw_handle(), &*pending, &mut transferred, 1);
    }
    Err(error)
}

fn create_pipe(name: &str, sid: &str) -> io::Result<OwnedHandle> {
    // Protected DACL: no inherited/Everyone/anonymous grant, network denied.
    // Same-user processes are the trust boundary of this feasibility-only probe.
    let sddl = wide(&format!("D:P(D;;GA;;;NU)(A;;GA;;;{sid})"));
    let mut descriptor = null_mut();
    // SAFETY: conversion returns a LocalFree allocation kept alive through creation.
    if unsafe {
        ConvertStringSecurityDescriptorToSecurityDescriptorW(
            sddl.as_ptr(),
            SDDL_REVISION_1,
            &mut descriptor,
            null_mut(),
        )
    } == 0
    {
        return Err(io::Error::last_os_error());
    }
    let _descriptor = LocalAllocation(descriptor);
    let attributes = SECURITY_ATTRIBUTES {
        nLength: size_of::<SECURITY_ATTRIBUTES>() as u32,
        lpSecurityDescriptor: descriptor,
        bInheritHandle: 0,
    };
    // SAFETY: the name and explicit security attributes remain valid for creation.
    // The first instance remains open for the entire server lifetime, avoiding a
    // name-recreation gap between clients and failing closed on a duplicate name.
    owned(unsafe {
        CreateNamedPipeW(
            wide(name).as_ptr(),
            PIPE_ACCESS_DUPLEX | FILE_FLAG_OVERLAPPED | FILE_FLAG_FIRST_PIPE_INSTANCE,
            PIPE_TYPE_MESSAGE | PIPE_READMODE_MESSAGE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS,
            1,
            256,
            256,
            2000,
            &attributes,
        )
    })
}

fn connect(name: &str, deadline: Instant) -> io::Result<OwnedHandle> {
    let name = wide(name);
    loop {
        // SECURITY_IDENTIFICATION lets the server inspect our identity but not
        // act with our privileges. Windows also checks the endpoint's DACL here.
        let handle = unsafe {
            CreateFileW(
                name.as_ptr(),
                GENERIC_READ | GENERIC_WRITE,
                0,
                null(),
                OPEN_EXISTING,
                FILE_FLAG_OVERLAPPED | SECURITY_SQOS_PRESENT | SECURITY_IDENTIFICATION,
                null_mut(),
            )
        };
        if handle != INVALID_HANDLE_VALUE {
            let pipe = owned(handle)?;
            // SAFETY: valid pipe handle; message reads reject oversized replies.
            if unsafe {
                SetNamedPipeHandleState(
                    pipe.as_raw_handle(),
                    &PIPE_READMODE_MESSAGE,
                    null(),
                    null(),
                )
            } == 0
            {
                return Err(io::Error::last_os_error());
            }
            return Ok(pipe);
        }
        let error = io::Error::last_os_error();
        if error.raw_os_error() != Some(ERROR_PIPE_BUSY as i32) {
            return Err(error);
        }
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return Err(io::Error::from(io::ErrorKind::TimedOut));
        }
        // SAFETY: only wait on this local pipe name within the client's deadline.
        if unsafe { WaitNamedPipeW(name.as_ptr(), milliseconds(remaining)) } == 0 {
            return Err(io::Error::last_os_error());
        }
    }
}

fn verify_server(pipe: &OwnedHandle, expected_sid: &str) -> io::Result<()> {
    let mut process_id = 0;
    // SAFETY: query the actual connected server, not a PID from the wire/name.
    if unsafe { GetNamedPipeServerProcessId(pipe.as_raw_handle(), &mut process_id) } == 0 {
        return Err(io::Error::last_os_error());
    }
    let process = owned(unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, process_id) })?;
    if process_sid(process.as_raw_handle())? != expected_sid {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "unexpected probe server user",
        ));
    }
    Ok(())
}

struct RevertIdentity;
impl Drop for RevertIdentity {
    fn drop(&mut self) {
        // SAFETY: never continue serving under an identity we failed to restore.
        if unsafe { RevertToSelf() } == 0 {
            std::process::abort();
        }
    }
}

fn verify_client(pipe: &OwnedHandle, expected_sid: &str) -> io::Result<()> {
    // Authenticate the token bound to the last pipe message, avoiding client PID
    // reuse. An identification-only token is sufficient; failure is never ignored.
    if unsafe { ImpersonateNamedPipeClient(pipe.as_raw_handle()) } == 0 {
        return Err(io::Error::last_os_error());
    }
    let _restore = RevertIdentity;
    let mut token = null_mut();
    if unsafe { OpenThreadToken(GetCurrentThread(), TOKEN_QUERY, 1, &mut token) } == 0 {
        return Err(io::Error::last_os_error());
    }
    if token_sid(&owned(token)?)? != expected_sid {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "unexpected probe client user",
        ));
    }
    Ok(())
}

fn ping_at(name: &str, expected_sid: &str) -> io::Result<()> {
    let deadline = Instant::now() + CLIENT_DEADLINE;
    let pipe = connect(name, deadline)?;
    verify_server(&pipe, expected_sid)?;
    let remaining = || deadline.saturating_duration_since(Instant::now());
    let written = operation(&pipe, None, remaining(), false, |state, count| unsafe {
        WriteFile(
            pipe.as_raw_handle(),
            REQUEST.as_ptr(),
            REQUEST.len() as u32,
            count,
            state,
        )
    })?;
    if written != REQUEST.len() {
        return Err(io::Error::from(io::ErrorKind::WriteZero));
    }
    let mut reply = [0u8; REPLY.len()];
    let received = operation(&pipe, None, remaining(), false, |state, count| unsafe {
        ReadFile(
            pipe.as_raw_handle(),
            reply.as_mut_ptr(),
            reply.len() as u32,
            count,
            state,
        )
    })?;
    if received != REPLY.len() || reply != REPLY {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "invalid versioned probe reply",
        ));
    }
    let acknowledged = operation(&pipe, None, remaining(), false, |state, count| unsafe {
        WriteFile(
            pipe.as_raw_handle(),
            ACK.as_ptr(),
            ACK.len() as u32,
            count,
            state,
        )
    })?;
    if acknowledged != ACK.len() {
        return Err(io::Error::from(io::ErrorKind::WriteZero));
    }
    Ok(())
}

pub fn ping() -> io::Result<()> {
    let sid = current_sid()?;
    ping_at(&endpoint(&sid), &sid)
}

fn accept(pipe: &OwnedHandle, stop: &OwnedHandle) -> io::Result<bool> {
    match operation(
        pipe,
        Some(stop),
        Duration::from_secs(60),
        true,
        |state, _| unsafe { ConnectNamedPipe(pipe.as_raw_handle(), state) },
    ) {
        Ok(_) => Ok(true),
        Err(error) if error.kind() == io::ErrorKind::TimedOut => Ok(false),
        Err(error) if error.raw_os_error() == Some(ERROR_NO_DATA as i32) => {
            // A client can connect and close before accept is posted. Reset the
            // same first instance instead of permanently losing the listener.
            unsafe { DisconnectNamedPipe(pipe.as_raw_handle()) };
            Ok(false)
        }
        Err(error) => Err(error),
    }
}

pub struct ProbeServer {
    stop: Arc<OwnedHandle>,
    worker: Mutex<Option<JoinHandle<()>>>,
}

impl ProbeServer {
    pub fn start() -> io::Result<Self> {
        let sid = current_sid()?;
        Self::start_at(&endpoint(&sid), sid)
    }

    fn start_at(name: &str, sid: String) -> io::Result<Self> {
        let pipe = create_pipe(name, &sid)?;
        let stop = Arc::new(event()?);
        let stop_thread = Arc::clone(&stop);
        let worker = thread::Builder::new()
            .name("phase-c-pipe-probe".into())
            .spawn(move || {
                loop {
                    match accept(&pipe, &stop_thread) {
                        Ok(true) => (),
                        Ok(false) => continue,
                        Err(_) => break,
                    }
                    let mut request = [0u8; REQUEST.len()];
                    let received = operation(
                        &pipe,
                        Some(&stop_thread),
                        SERVER_DEADLINE,
                        false,
                        |state, count| unsafe {
                            ReadFile(
                                pipe.as_raw_handle(),
                                request.as_mut_ptr(),
                                request.len() as u32,
                                count,
                                state,
                            )
                        },
                    );
                    if received.ok() == Some(REQUEST.len())
                        && request == REQUEST
                        && verify_client(&pipe, &sid).is_ok()
                    {
                        let sent = operation(
                            &pipe,
                            Some(&stop_thread),
                            SERVER_DEADLINE,
                            false,
                            |state, count| unsafe {
                                WriteFile(
                                    pipe.as_raw_handle(),
                                    REPLY.as_ptr(),
                                    REPLY.len() as u32,
                                    count,
                                    state,
                                )
                            },
                        );
                        if sent.ok() == Some(REPLY.len()) {
                            // DisconnectNamedPipe discards unread output. A bounded
                            // acknowledgement proves the client consumed PONG without
                            // an unbounded FlushFileBuffers during app shutdown.
                            let mut ack = [0u8; ACK.len()];
                            let _ = operation(
                                &pipe,
                                Some(&stop_thread),
                                SERVER_DEADLINE,
                                false,
                                |state, count| unsafe {
                                    ReadFile(
                                        pipe.as_raw_handle(),
                                        ack.as_mut_ptr(),
                                        ack.len() as u32,
                                        count,
                                        state,
                                    )
                                },
                            );
                        }
                    }
                    // SAFETY: pending I/O has completed or been cancelled and drained.
                    // Never FlushFileBuffers: an unresponsive client could block exit.
                    unsafe { DisconnectNamedPipe(pipe.as_raw_handle()) };
                }
            })?;
        Ok(Self {
            stop,
            worker: Mutex::new(Some(worker)),
        })
    }

    /// Tauri's explicit Exit event must invoke this; Drop is not guaranteed there.
    /// The lock covers joining so concurrent callers also wait for completed exit.
    pub fn shutdown(&self) {
        // SAFETY: the owned event outlives the worker and every shutdown call.
        unsafe { SetEvent(self.stop.as_raw_handle()) };
        let mut worker = self
            .worker
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        if let Some(worker) = worker.take() {
            let _ = worker.join();
        }
    }
}

impl Drop for ProbeServer {
    fn drop(&mut self) {
        self.shutdown();
    }
}

#[cfg(test)]
#[path = "windows_tests.rs"]
mod tests;

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

use super::*;
use windows_sys::Win32::Foundation::ERROR_ACCESS_DENIED;
use windows_sys::Win32::Security::{
    CreateRestrictedToken, CreateWellKnownSid, DISABLE_MAX_PRIVILEGE, ImpersonateLoggedOnUser,
    SID_AND_ATTRIBUTES, TOKEN_DUPLICATE, WinWorldSid,
};
use windows_sys::Win32::Storage::FileSystem::SECURITY_ANONYMOUS;

fn private_server() -> (String, String, ProbeServer) {
    let sid = current_sid().unwrap();
    let name = format!(r"\\.\pipe\mathboard-c-probe-test-{}", uuid::Uuid::new_v4());
    let server = ProbeServer::start_at(&name, sid.clone()).unwrap();
    (name, sid, server)
}

fn send(pipe: &OwnedHandle, bytes: &[u8]) -> io::Result<usize> {
    operation(pipe, None, CLIENT_DEADLINE, false, |state, count| unsafe {
        WriteFile(
            pipe.as_raw_handle(),
            bytes.as_ptr(),
            bytes.len() as u32,
            count,
            state,
        )
    })
}

fn read_reply(pipe: &OwnedHandle) -> io::Result<Vec<u8>> {
    let mut bytes = vec![0; REPLY.len()];
    let read = operation(pipe, None, CLIENT_DEADLINE, false, |state, count| unsafe {
        ReadFile(
            pipe.as_raw_handle(),
            bytes.as_mut_ptr(),
            bytes.len() as u32,
            count,
            state,
        )
    })?;
    bytes.truncate(read);
    Ok(bytes)
}

#[test]
fn repeated_same_user_messages_are_delivered_before_disconnect() {
    let (name, sid, _server) = private_server();
    for _ in 0..25 {
        ping_at(&name, &sid).unwrap();
    }
}

#[test]
fn client_that_closes_before_accept_does_not_destroy_the_listener() {
    let sid = current_sid().unwrap();
    let name = format!(r"\\.\pipe\mathboard-c-probe-test-{}", uuid::Uuid::new_v4());
    let pipe = create_pipe(&name, &sid).unwrap();
    let stop = event().unwrap();
    let client = connect(&name, Instant::now() + CLIENT_DEADLINE).unwrap();
    drop(client);
    assert!(!accept(&pipe, &stop).unwrap());
    // A reused instance needs its next ConnectNamedPipe posted while the next
    // client connects. Keep the returned handle alive until that client opens.
    let waiting = thread::spawn(move || {
        let accepted = accept(&pipe, &stop).unwrap();
        (pipe, accepted)
    });
    let next = connect(&name, Instant::now() + CLIENT_DEADLINE).unwrap();
    let (_pipe, accepted) = waiting.join().unwrap();
    assert!(accepted);
    drop(next);
}

#[test]
fn shutdown_cancels_pending_accept_and_releases_the_endpoint() {
    let (name, sid, server) = private_server();
    let start = Instant::now();
    server.shutdown();
    assert!(start.elapsed() < Duration::from_secs(1));
    assert!(connect(&name, Instant::now() + CLIENT_DEADLINE).is_err());
    let next = ProbeServer::start_at(&name, sid.clone()).unwrap();
    drop(server);
    ping_at(&name, &sid).unwrap();
    next.shutdown();
}

#[test]
fn shutdown_cancels_an_idle_connected_client_without_waiting_for_its_timeout() {
    let (name, _sid, server) = private_server();
    let client = connect(&name, Instant::now() + CLIENT_DEADLINE).unwrap();
    let start = Instant::now();
    server.shutdown();
    assert!(start.elapsed() < Duration::from_secs(1));
    assert!(read_reply(&client).is_err());
}

#[test]
fn idle_client_is_disconnected_and_the_next_client_can_connect() {
    let (name, sid, _server) = private_server();
    let client = connect(&name, Instant::now() + CLIENT_DEADLINE).unwrap();
    assert!(read_reply(&client).is_err());
    drop(client);
    ping_at(&name, &sid).unwrap();
}

#[test]
fn malformed_version_and_oversized_messages_are_rejected_without_poisoning_the_server() {
    let (name, sid, _server) = private_server();
    for bytes in [b"MATHBOARD-C-PROBE/9 PING\n".to_vec(), vec![b'x'; 1024]] {
        let client = connect(&name, Instant::now() + CLIENT_DEADLINE).unwrap();
        let _ = send(&client, &bytes);
        assert_ne!(read_reply(&client).ok().as_deref(), Some(REPLY));
        drop(client);
        ping_at(&name, &sid).unwrap();
    }
}

#[test]
fn client_checks_the_connected_servers_token_before_sending_the_ping() {
    let (name, sid, _server) = private_server();
    let error = ping_at(&name, "S-1-0-0").unwrap_err();
    assert_eq!(error.kind(), io::ErrorKind::PermissionDenied);
    ping_at(&name, &sid).unwrap();
}

#[test]
fn anonymous_sqos_client_is_rejected_even_when_the_pipe_acl_allows_its_process_user() {
    let (name, sid, _server) = private_server();
    // SAFETY: this test intentionally withholds the client's identification token.
    let client = owned(unsafe {
        CreateFileW(
            wide(&name).as_ptr(),
            GENERIC_READ | GENERIC_WRITE,
            0,
            null(),
            OPEN_EXISTING,
            FILE_FLAG_OVERLAPPED | SECURITY_SQOS_PRESENT | SECURITY_ANONYMOUS,
            null_mut(),
        )
    })
    .unwrap();
    send(&client, REQUEST).unwrap();
    assert_ne!(read_reply(&client).ok().as_deref(), Some(REPLY));
    drop(client);
    ping_at(&name, &sid).unwrap();
}

#[test]
fn unresponsive_server_is_cancelled_at_the_client_deadline() {
    let sid = current_sid().unwrap();
    let name = format!(r"\\.\pipe\mathboard-c-probe-test-{}", uuid::Uuid::new_v4());
    let pipe = create_pipe(&name, &sid).unwrap();
    let release = Arc::new(event().unwrap());
    let worker_release = Arc::clone(&release);
    let worker = thread::spawn(move || {
        operation(&pipe, None, CLIENT_DEADLINE, true, |state, _| unsafe {
            ConnectNamedPipe(pipe.as_raw_handle(), state)
        })
        .unwrap();
        let mut bytes = [0; REQUEST.len()];
        operation(&pipe, None, CLIENT_DEADLINE, false, |state, count| unsafe {
            ReadFile(
                pipe.as_raw_handle(),
                bytes.as_mut_ptr(),
                bytes.len() as u32,
                count,
                state,
            )
        })
        .unwrap();
        // Keep the connection alive but deliberately never send a reply.
        unsafe { WaitForSingleObject(worker_release.as_raw_handle(), 5000) };
    });
    let start = Instant::now();
    let result = ping_at(&name, &sid);
    unsafe { SetEvent(release.as_raw_handle()) };
    worker.join().unwrap();
    assert_eq!(result.unwrap_err().kind(), io::ErrorKind::TimedOut);
    assert!(start.elapsed() < Duration::from_secs(3));
}

#[test]
fn os_dacl_denies_a_restricted_token_without_granting_the_world_group_access() {
    let (name, sid, _server) = private_server();
    let mut original = null_mut();
    assert_ne!(
        unsafe {
            OpenProcessToken(
                GetCurrentProcess(),
                TOKEN_QUERY | TOKEN_DUPLICATE,
                &mut original,
            )
        },
        0
    );
    let original = owned(original).unwrap();
    let mut world = [0usize; 16];
    let mut world_bytes = size_of_val(&world) as u32;
    assert_ne!(
        unsafe {
            CreateWellKnownSid(
                WinWorldSid,
                null_mut(),
                world.as_mut_ptr().cast(),
                &mut world_bytes,
            )
        },
        0
    );
    let restricting_sid = SID_AND_ATTRIBUTES {
        Sid: world.as_mut_ptr().cast(),
        Attributes: 0,
    };
    let mut restricted = null_mut();
    assert_ne!(
        unsafe {
            CreateRestrictedToken(
                original.as_raw_handle(),
                DISABLE_MAX_PRIVILEGE,
                0,
                null(),
                0,
                null(),
                1,
                &restricting_sid,
                &mut restricted,
            )
        },
        0
    );
    let restricted = owned(restricted).unwrap();
    let denied = {
        assert_ne!(
            unsafe { ImpersonateLoggedOnUser(restricted.as_raw_handle()) },
            0
        );
        let _restore = RevertIdentity;
        let opened = unsafe {
            CreateFileW(
                wide(&name).as_ptr(),
                GENERIC_READ | GENERIC_WRITE,
                0,
                null(),
                OPEN_EXISTING,
                FILE_FLAG_OVERLAPPED | SECURITY_SQOS_PRESENT | SECURITY_IDENTIFICATION,
                null_mut(),
            )
        };
        if opened == INVALID_HANDLE_VALUE {
            io::Error::last_os_error().raw_os_error()
        } else {
            drop(owned(opened).unwrap());
            None
        }
    };
    assert_eq!(denied, Some(ERROR_ACCESS_DENIED as i32));
    ping_at(&name, &sid).unwrap();
    // This is native restricted-token evidence, not another-account acceptance.
}

#[test]
fn restart_invalidates_an_old_client_handle_without_losing_the_pipe_name() {
    let (name, sid, first) = private_server();
    let stale_client = connect(&name, Instant::now() + CLIENT_DEADLINE).unwrap();
    first.shutdown();
    assert!(read_reply(&stale_client).is_err());
    let next = ProbeServer::start_at(&name, sid.clone()).unwrap();
    drop(stale_client);
    drop(first);
    ping_at(&name, &sid).unwrap();
    next.shutdown();
}

#[test]
fn delayed_reader_receives_pong_and_missing_ack_does_not_hold_the_server_forever() {
    let (name, sid, _server) = private_server();
    let client = connect(&name, Instant::now() + CLIENT_DEADLINE).unwrap();
    send(&client, REQUEST).unwrap();
    thread::sleep(Duration::from_millis(150));
    assert_eq!(read_reply(&client).unwrap(), REPLY);
    // No ACK: the server must disconnect at its bounded acknowledgement deadline.
    assert!(read_reply(&client).is_err());
    drop(client);
    ping_at(&name, &sid).unwrap();
}

#[test]
fn shutdown_cancels_the_pending_ack_without_waiting_for_the_client() {
    let (name, _sid, server) = private_server();
    let client = connect(&name, Instant::now() + CLIENT_DEADLINE).unwrap();
    send(&client, REQUEST).unwrap();
    assert_eq!(read_reply(&client).unwrap(), REPLY);
    let start = Instant::now();
    server.shutdown();
    assert!(start.elapsed() < Duration::from_secs(1));
    assert!(read_reply(&client).is_err());
}

#[derive(Clone, Copy)]
enum PendingKind {
    Accept,
    Read,
    Write,
}

fn cancel_actual_pending_operation(kind: PendingKind) {
    let sid = current_sid().unwrap();
    let name = format!(r"\\.\pipe\mathboard-c-probe-test-{}", uuid::Uuid::new_v4());
    let pipe = create_pipe(&name, &sid).unwrap();
    let stop = Arc::new(event().unwrap());
    let worker_stop = Arc::clone(&stop);
    let (started, receive_started) = std::sync::mpsc::channel();
    let worker = thread::spawn(move || {
        if !matches!(kind, PendingKind::Accept) {
            operation(&pipe, None, CLIENT_DEADLINE, true, |state, _| unsafe {
                ConnectNamedPipe(pipe.as_raw_handle(), state)
            })
            .unwrap();
        }
        // Deliberately exceed the small native pipe buffer. This tests the I/O
        // cancellation primitive; production frames remain fixed and tiny.
        let bytes = vec![0u8; 1024 * 1024];
        let mut read_buffer = [0u8; REQUEST.len()];
        operation(
            &pipe,
            Some(&worker_stop),
            CLIENT_DEADLINE,
            matches!(kind, PendingKind::Accept),
            |state, count| {
                let result = unsafe {
                    match kind {
                        PendingKind::Accept => ConnectNamedPipe(pipe.as_raw_handle(), state),
                        PendingKind::Read => ReadFile(
                            pipe.as_raw_handle(),
                            read_buffer.as_mut_ptr(),
                            read_buffer.len() as u32,
                            count,
                            state,
                        ),
                        PendingKind::Write => WriteFile(
                            pipe.as_raw_handle(),
                            bytes.as_ptr(),
                            bytes.len() as u32,
                            count,
                            state,
                        ),
                    }
                };
                let last_error = unsafe { windows_sys::Win32::Foundation::GetLastError() };
                let pending = result == 0 && last_error == ERROR_IO_PENDING;
                // Never panic between queuing I/O and handing control back to
                // operation, even when the receiving test thread has failed.
                let _ = started.send(pending);
                // Sending on a channel may call Windows too; preserve the API's
                // last-error contract for the operation wrapper under test.
                unsafe { windows_sys::Win32::Foundation::SetLastError(last_error) };
                result
            },
        )
    });
    let _client = if matches!(kind, PendingKind::Accept) {
        None
    } else {
        Some(connect(&name, Instant::now() + CLIENT_DEADLINE).unwrap())
    };
    let was_pending = receive_started.recv_timeout(CLIENT_DEADLINE).unwrap();
    unsafe { SetEvent(stop.as_raw_handle()) };
    let result = worker.join().unwrap();
    assert!(
        was_pending,
        "the test must cancel an operation that returned ERROR_IO_PENDING"
    );
    assert_eq!(result.unwrap_err().kind(), io::ErrorKind::Interrupted);
}

#[test]
fn cancellation_drains_a_real_pending_write_before_releasing_its_buffer() {
    cancel_actual_pending_operation(PendingKind::Write);
}

#[test]
fn cancellation_drains_a_real_pending_read_before_releasing_its_buffer() {
    cancel_actual_pending_operation(PendingKind::Read);
}

#[test]
fn cancellation_drains_a_real_pending_accept_before_releasing_its_state() {
    cancel_actual_pending_operation(PendingKind::Accept);
}

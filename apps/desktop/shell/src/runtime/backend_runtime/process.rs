// SPDX-License-Identifier: GPL-3.0-only

#[cfg(unix)]
use std::io;
#[cfg(windows)]
use std::process::Command;
use std::process::{Child, ExitStatus};
use std::thread;
use std::time::{Duration, Instant};

use tauri::Manager;

#[cfg(windows)]
use super::suppress_windows_console_window;
use super::{BackendProcess, BackendStartingProcessPid};
#[cfg(windows)]
use windows_sys::Win32::Foundation::{
    CloseHandle, GetLastError, ERROR_ACCESS_DENIED, ERROR_INVALID_PARAMETER, STILL_ACTIVE,
};
#[cfg(windows)]
use windows_sys::Win32::System::Threading::{
    GetExitCodeProcess, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
};

pub(super) fn format_backend_startup_exit_status(status: ExitStatus) -> String {
    if let Some(code) = status.code() {
        return format!("exitCode={code}");
    }
    #[cfg(unix)]
    {
        use std::os::unix::process::ExitStatusExt;
        if let Some(signal) = status.signal() {
            return format!("signal={signal}");
        }
    }
    "exitStatus=unknown".to_string()
}

#[cfg(unix)]
pub(super) fn pid_exists(pid: u32) -> bool {
    // SAFETY: kill(pid, 0) only probes process existence and does not deliver a signal.
    let result = unsafe { libc::kill(pid as i32, 0) };
    if result == 0 {
        return true;
    }
    matches!(io::Error::last_os_error().raw_os_error(), Some(libc::EPERM))
}

#[cfg(windows)]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(super) enum ProcessExistence {
    Exists,
    Missing,
    Unknown,
}

#[cfg(windows)]
pub(super) fn pid_exists(pid: u32) -> bool {
    // A failed Windows process probe is not evidence that the process exited.
    // Keep reconciliation fail-closed by treating Unknown as still present.
    pid_existence(pid) != ProcessExistence::Missing
}

#[cfg(windows)]
pub(super) fn pid_existence(pid: u32) -> ProcessExistence {
    // SAFETY: OpenProcess only requests query access for the specific PID.
    // The returned handle is closed on every successful-open path below.
    let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
    if handle.is_null() {
        // SAFETY: GetLastError reads the calling thread's last-error value.
        return match unsafe { GetLastError() } {
            ERROR_INVALID_PARAMETER => ProcessExistence::Missing,
            // Access denied still proves that the protected process exists.
            ERROR_ACCESS_DENIED => ProcessExistence::Exists,
            _ => ProcessExistence::Unknown,
        };
    }

    let mut exit_code = 0u32;
    // SAFETY: handle is a valid process handle and exit_code points to writable
    // storage for the duration of the call.
    let queried = unsafe { GetExitCodeProcess(handle, &mut exit_code) } != 0;
    // SAFETY: handle came from OpenProcess and is no longer used afterwards.
    let _ = unsafe { CloseHandle(handle) };
    if !queried {
        return ProcessExistence::Unknown;
    }
    if exit_code == STILL_ACTIVE as u32 {
        ProcessExistence::Exists
    } else {
        ProcessExistence::Missing
    }
}

#[cfg(all(test, windows))]
mod windows_tests {
    use super::{pid_existence, ProcessExistence};

    #[test]
    fn windows_process_probe_distinguishes_live_and_invalid_pids() {
        assert_eq!(pid_existence(std::process::id()), ProcessExistence::Exists);
        assert_eq!(pid_existence(u32::MAX), ProcessExistence::Missing);
    }
}

#[cfg(unix)]
pub(super) fn send_signal_to_pid(pid: u32, signal: i32) -> bool {
    // SAFETY: Signal values are chosen by callers from known platform constants.
    let result = unsafe { libc::kill(pid as i32, signal) };
    if result == 0 {
        return true;
    }
    matches!(io::Error::last_os_error().raw_os_error(), Some(libc::ESRCH))
}

// killpg semantics: signal the whole process group led by pid. Backends are
// spawned with process_group(0), so pid is the group id. Returns false when
// the group does not exist (e.g. an orphan pid that is not a group leader) so
// callers fall back to signalling the pid directly.
#[cfg(unix)]
pub(super) fn send_signal_to_process_group(pid: u32, signal: i32) -> bool {
    // SAFETY: kill(-pgid, signal) delivers to every member of the group led by
    // pid. Signal values are chosen by callers from known platform constants.
    let result = unsafe { libc::kill(-(pid as i32), signal) };
    result == 0
}

fn wait_for_pid_exit(pid: u32, timeout_ms: u64) -> bool {
    let started_at = Instant::now();
    loop {
        if process_existence_is_missing(pid) {
            return true;
        }
        if started_at.elapsed() >= Duration::from_millis(timeout_ms) {
            return false;
        }
        thread::sleep(Duration::from_millis(100));
    }
}

#[cfg(windows)]
fn process_existence_is_missing(pid: u32) -> bool {
    pid_existence(pid) == ProcessExistence::Missing
}

#[cfg(unix)]
fn process_existence_is_missing(pid: u32) -> bool {
    !pid_exists(pid)
}

fn wait_for_tracked_child_exit(child: &mut Child, timeout_ms: u64) -> bool {
    let started_at = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_)) => return true,
            Ok(None) => {}
            Err(_) => return false,
        }
        if started_at.elapsed() >= Duration::from_millis(timeout_ms) {
            return false;
        }
        thread::sleep(Duration::from_millis(100));
    }
}
#[cfg(unix)]
pub(super) fn terminate_backend_pid(pid: u32) -> bool {
    if !pid_exists(pid) {
        return true;
    }
    if (send_signal_to_process_group(pid, libc::SIGTERM) || send_signal_to_pid(pid, libc::SIGTERM))
        && wait_for_pid_exit(pid, 4_000)
    {
        return true;
    }
    if (send_signal_to_process_group(pid, libc::SIGKILL) || send_signal_to_pid(pid, libc::SIGKILL))
        && wait_for_pid_exit(pid, 2_000)
    {
        return true;
    }
    false
}
#[cfg(windows)]
pub(super) fn terminate_backend_pid(pid: u32) -> bool {
    if pid_existence(pid) == ProcessExistence::Missing {
        return true;
    }
    let mut graceful_command = Command::new("taskkill");
    suppress_windows_console_window(&mut graceful_command);
    let graceful = graceful_command
        .args(["/PID", &pid.to_string(), "/T"])
        .status()
        .map(|status| status.success())
        .unwrap_or(false);
    if graceful && wait_for_pid_exit(pid, 4_000) {
        return true;
    }
    let mut forceful_command = Command::new("taskkill");
    suppress_windows_console_window(&mut forceful_command);
    let forceful = forceful_command
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .status()
        .map(|status| status.success())
        .unwrap_or(false);
    if forceful && wait_for_pid_exit(pid, 2_000) {
        return true;
    }
    !matches!(pid_existence(pid), ProcessExistence::Exists)
}

#[cfg(unix)]
pub(super) fn request_backend_pid_shutdown(pid: u32) -> bool {
    if !pid_exists(pid) {
        return true;
    }
    send_signal_to_process_group(pid, libc::SIGTERM) || send_signal_to_pid(pid, libc::SIGTERM)
}

#[cfg(windows)]
pub(super) fn request_backend_pid_shutdown(pid: u32) -> bool {
    if pid_existence(pid) == ProcessExistence::Missing {
        return true;
    }
    let mut command = Command::new("taskkill");
    suppress_windows_console_window(&mut command);
    command
        .args(["/PID", &pid.to_string(), "/T"])
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

pub(super) fn request_tracked_child_shutdown(child: &mut Child) -> bool {
    if wait_for_tracked_child_exit(child, 0) {
        return true;
    }
    let pid = child.id();
    #[cfg(unix)]
    {
        send_signal_to_process_group(pid, libc::SIGTERM) || send_signal_to_pid(pid, libc::SIGTERM)
    }
    #[cfg(windows)]
    {
        let mut command = Command::new("taskkill");
        suppress_windows_console_window(&mut command);
        command
            .args(["/PID", &pid.to_string(), "/T"])
            .status()
            .map(|status| status.success())
            .unwrap_or(false)
    }
    #[cfg(all(not(unix), not(windows)))]
    {
        child.kill().is_ok()
    }
}

pub(super) fn terminate_tracked_child_process(child: &mut Child) {
    #[cfg(unix)]
    {
        let pid = child.id();
        if wait_for_tracked_child_exit(child, 0) {
            return;
        }
        if (send_signal_to_process_group(pid, libc::SIGTERM)
            || send_signal_to_pid(pid, libc::SIGTERM))
            && wait_for_tracked_child_exit(child, 4_000)
        {
            return;
        }
        if (send_signal_to_process_group(pid, libc::SIGKILL)
            || send_signal_to_pid(pid, libc::SIGKILL))
            && wait_for_tracked_child_exit(child, 2_000)
        {
            return;
        }
        let _ = child.try_wait();
    }
    #[cfg(windows)]
    {
        let pid = child.id();
        if wait_for_tracked_child_exit(child, 0) {
            return;
        }
        let mut graceful_command = Command::new("taskkill");
        suppress_windows_console_window(&mut graceful_command);
        let _ = graceful_command
            .args(["/PID", &pid.to_string(), "/T"])
            .status();
        if wait_for_tracked_child_exit(child, 4_000) {
            return;
        }
        let mut forceful_command = Command::new("taskkill");
        suppress_windows_console_window(&mut forceful_command);
        let _ = forceful_command
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .status();
        if wait_for_tracked_child_exit(child, 2_000) {
            return;
        }
        let _ = child.try_wait();
    }
    #[cfg(all(not(unix), not(windows)))]
    {
        if child.kill().is_ok() && wait_for_tracked_child_exit(child, 2_000) {
            return;
        }
        let _ = child.try_wait();
    }
}

pub(super) fn tracked_backend_pid(app: &tauri::AppHandle) -> Option<u32> {
    let state = app.try_state::<BackendProcess>()?;
    let mut guard = match state.0.lock() {
        Ok(guard) => guard,
        Err(_) => {
            eprintln!("[backend_runtime] mutex poisoned in tracked_backend_pid");
            return None;
        }
    };
    let child = guard.as_mut()?;
    match child.try_wait() {
        Ok(Some(_)) => {
            *guard = None;
            None
        }
        Ok(None) => Some(child.id()),
        Err(_) => Some(child.id()),
    }
}

pub(super) fn record_starting_backend_pid(app: &tauri::AppHandle, pid: u32) {
    if let Some(state) = app.try_state::<BackendStartingProcessPid>() {
        if let Ok(mut guard) = state.0.lock() {
            *guard = Some(pid);
        }
    }
}

pub(super) fn clear_starting_backend_pid(app: &tauri::AppHandle, pid: u32) {
    if let Some(state) = app.try_state::<BackendStartingProcessPid>() {
        if let Ok(mut guard) = state.0.lock() {
            if *guard == Some(pid) {
                *guard = None;
            }
        }
    }
}

pub(super) fn take_starting_backend_pid(app: &tauri::AppHandle) -> Option<u32> {
    let state = app.try_state::<BackendStartingProcessPid>()?;
    let mut guard = state.0.lock().ok()?;
    guard.take()
}

#[cfg(all(test, unix))]
mod tracked_child_exit_tests {
    use super::{
        format_backend_startup_exit_status, pid_exists, send_signal_to_process_group,
        terminate_tracked_child_process, wait_for_pid_exit, wait_for_tracked_child_exit,
    };
    use std::process::Command;
    use std::time::{Duration, Instant};

    #[test]
    fn wait_for_tracked_child_exit_reaps_completed_child_without_pid_poll_timeout() {
        let mut child = Command::new("sh")
            .arg("-c")
            .arg("exit 0")
            .spawn()
            .expect("spawn completed child");
        let started_at = Instant::now();

        assert!(wait_for_tracked_child_exit(&mut child, 1_000));
        assert!(started_at.elapsed() < Duration::from_secs(1));
    }

    #[test]
    fn terminate_tracked_child_process_reaps_sigterm_child_without_pid_poll_timeout() {
        let mut child = Command::new("sleep")
            .arg("30")
            .spawn()
            .expect("spawn sleep child");
        let started_at = Instant::now();

        terminate_tracked_child_process(&mut child);

        assert!(started_at.elapsed() < Duration::from_secs(2));
    }

    #[test]
    fn startup_exit_diagnostic_is_stable_and_bounded() {
        let status = Command::new("sh")
            .arg("-c")
            .arg("exit 7")
            .status()
            .expect("run deterministic exit");

        let diagnostic = format_backend_startup_exit_status(status);

        assert_eq!(diagnostic, "exitCode=7");
        assert!(diagnostic.len() <= 32);
    }

    #[test]
    fn process_group_signal_reaches_group_members() {
        use std::io::BufRead;
        use std::os::unix::process::CommandExt;

        let mut child = Command::new("sh")
            .arg("-c")
            .arg("sleep 30 & echo $! && wait")
            .stdout(std::process::Stdio::piped())
            .process_group(0)
            .spawn()
            .expect("spawn process-group leader");
        let pid = child.id();
        let mut grandchild_pid = 0u32;
        if let Some(stdout) = child.stdout.take() {
            let mut line = String::new();
            let _ = std::io::BufReader::new(stdout).read_line(&mut line);
            grandchild_pid = line
                .split_whitespace()
                .next()
                .and_then(|value| value.parse().ok())
                .unwrap_or(0);
        }
        assert!(
            grandchild_pid > 0,
            "group leader should report its child pid"
        );
        assert!(pid_exists(grandchild_pid));

        assert!(send_signal_to_process_group(pid, libc::SIGTERM));
        assert!(
            wait_for_pid_exit(grandchild_pid, 2_000),
            "terminating the group must reach members, not just the leader",
        );
        let _ = child.wait();
    }
}

// SPDX-License-Identifier: GPL-3.0-only

use std::path::{Path, PathBuf};

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct BackendProcessIdentity {
    pub(crate) pid: u32,
    pub(crate) parent_pid: u32,
    pub(crate) started_at_ms: u64,
    pub(crate) executable_path: PathBuf,
    pub(crate) arguments: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum BackendOrphanEndpointEvidence {
    UnauthorizedBridgeTokenMismatch,
    AuthenticatedHealth {
        status: String,
        pid: u32,
        runtime_build_id: String,
    },
    Unverified,
}

pub(crate) struct BackendOrphanValidation<'a> {
    pub(crate) state_pid: u32,
    pub(crate) state_parent_pid: Option<u32>,
    pub(crate) state_started_at_ms: Option<u64>,
    pub(crate) state_runtime_build_id: &'a str,
    pub(crate) state_release_channel: Option<&'a str>,
    pub(crate) current_app_pid: u32,
    pub(crate) current_release_channel: &'a str,
    pub(crate) state_parent_is_live: bool,
    pub(crate) process: &'a BackendProcessIdentity,
    pub(crate) expected_node_runtime: &'a Path,
    pub(crate) expected_backend_entries: &'a [PathBuf],
    pub(crate) endpoint: &'a BackendOrphanEndpointEvidence,
    pub(crate) now_ms: u64,
    pub(crate) max_state_write_delay_ms: u64,
    pub(crate) allow_init_reparent: bool,
    pub(crate) case_insensitive_paths: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum BackendOrphanValidationError {
    InvalidStatePid,
    InvalidStateParentPid,
    StateOwnedByCurrentApp,
    StateParentStillLive,
    ReleaseChannelMismatch,
    InvalidRuntimeBuildId,
    InvalidStateStartedAt,
    InvalidProcessStartedAt,
    ProcessStartedAfterState,
    StateWriteDelayExceeded,
    ProcessPidMismatch,
    ProcessParentMismatch,
    ExecutablePathMismatch,
    ProcessArgumentVectorInvalid,
    ProcessExecutableArgumentMismatch,
    BackendEntryArgumentMismatch,
    EndpointUnverified,
    HealthStatusInvalid,
    HealthPidMismatch,
    HealthBuildIdMismatch,
}

const ORPHAN_CLOCK_SKEW_MS: u64 = 5_000;

pub(crate) fn validate_backend_orphan_identity(
    input: &BackendOrphanValidation<'_>,
) -> Result<(), BackendOrphanValidationError> {
    if input.state_pid <= 1 {
        return Err(BackendOrphanValidationError::InvalidStatePid);
    }
    let state_parent_pid = input
        .state_parent_pid
        .filter(|pid| *pid > 1)
        .ok_or(BackendOrphanValidationError::InvalidStateParentPid)?;
    if state_parent_pid == input.current_app_pid {
        return Err(BackendOrphanValidationError::StateOwnedByCurrentApp);
    }
    if input.state_parent_is_live {
        return Err(BackendOrphanValidationError::StateParentStillLive);
    }
    if input.state_release_channel != Some(input.current_release_channel) {
        return Err(BackendOrphanValidationError::ReleaseChannelMismatch);
    }
    if !bounded_state_identifier(input.state_runtime_build_id) {
        return Err(BackendOrphanValidationError::InvalidRuntimeBuildId);
    }

    let state_started_at_ms = input
        .state_started_at_ms
        .filter(|value| *value > 0)
        .ok_or(BackendOrphanValidationError::InvalidStateStartedAt)?;
    if state_started_at_ms > input.now_ms.saturating_add(ORPHAN_CLOCK_SKEW_MS) {
        return Err(BackendOrphanValidationError::InvalidStateStartedAt);
    }
    if input.process.started_at_ms == 0
        || input.process.started_at_ms > input.now_ms.saturating_add(ORPHAN_CLOCK_SKEW_MS)
    {
        return Err(BackendOrphanValidationError::InvalidProcessStartedAt);
    }
    if input.process.started_at_ms > state_started_at_ms.saturating_add(ORPHAN_CLOCK_SKEW_MS) {
        return Err(BackendOrphanValidationError::ProcessStartedAfterState);
    }
    if state_started_at_ms.saturating_sub(input.process.started_at_ms)
        > input.max_state_write_delay_ms
    {
        return Err(BackendOrphanValidationError::StateWriteDelayExceeded);
    }

    if input.process.pid != input.state_pid {
        return Err(BackendOrphanValidationError::ProcessPidMismatch);
    }
    let process_parent_matches = input.process.parent_pid == state_parent_pid
        || (input.allow_init_reparent && input.process.parent_pid == 1);
    if !process_parent_matches {
        return Err(BackendOrphanValidationError::ProcessParentMismatch);
    }
    if !identity_paths_match(
        input.process.executable_path.as_path(),
        input.expected_node_runtime,
        input.case_insensitive_paths,
    ) {
        return Err(BackendOrphanValidationError::ExecutablePathMismatch);
    }
    if input.process.arguments.len() < 2 {
        return Err(BackendOrphanValidationError::ProcessArgumentVectorInvalid);
    }
    if !identity_paths_match(
        Path::new(input.process.arguments[0].as_str()),
        input.expected_node_runtime,
        input.case_insensitive_paths,
    ) {
        return Err(BackendOrphanValidationError::ProcessExecutableArgumentMismatch);
    }
    if !input.expected_backend_entries.iter().any(|entry| {
        identity_paths_match(
            Path::new(input.process.arguments[1].as_str()),
            entry.as_path(),
            input.case_insensitive_paths,
        )
    }) {
        return Err(BackendOrphanValidationError::BackendEntryArgumentMismatch);
    }

    match input.endpoint {
        BackendOrphanEndpointEvidence::UnauthorizedBridgeTokenMismatch => Ok(()),
        BackendOrphanEndpointEvidence::AuthenticatedHealth {
            status,
            pid,
            runtime_build_id,
        } => {
            if !status.trim().eq_ignore_ascii_case("UP") {
                return Err(BackendOrphanValidationError::HealthStatusInvalid);
            }
            if *pid != input.state_pid {
                return Err(BackendOrphanValidationError::HealthPidMismatch);
            }
            if runtime_build_id != input.state_runtime_build_id {
                return Err(BackendOrphanValidationError::HealthBuildIdMismatch);
            }
            Ok(())
        }
        BackendOrphanEndpointEvidence::Unverified => {
            Err(BackendOrphanValidationError::EndpointUnverified)
        }
    }
}

fn bounded_state_identifier(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 512
        && value == value.trim()
        && !value.chars().any(char::is_control)
}

fn identity_paths_match(left: &Path, right: &Path, case_insensitive: bool) -> bool {
    let Some(left) = normalized_identity_path(left, case_insensitive) else {
        return false;
    };
    let Some(right) = normalized_identity_path(right, case_insensitive) else {
        return false;
    };
    left == right
}

fn normalized_identity_path(path: &Path, case_insensitive: bool) -> Option<String> {
    let raw = path.to_str()?.trim();
    if raw.is_empty() {
        return None;
    }
    if !case_insensitive {
        if !path.is_absolute() {
            return None;
        }
        return Some(raw.to_string());
    }

    let mut normalized = raw.replace('/', "\\");
    if let Some(stripped) = normalized.strip_prefix(r"\\?\UNC\") {
        normalized = format!(r"\\{}", stripped);
    } else if let Some(stripped) = normalized.strip_prefix(r"\\?\") {
        normalized = stripped.to_string();
    }
    let bytes = normalized.as_bytes();
    let is_drive_absolute =
        bytes.len() >= 3 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':' && bytes[2] == b'\\';
    if !is_drive_absolute && !normalized.starts_with(r"\\") {
        return None;
    }
    Some(normalized.to_lowercase())
}

#[cfg(target_os = "macos")]
pub(crate) fn inspect_backend_process(pid: u32) -> Option<BackendProcessIdentity> {
    macos_process_inspection::inspect(pid)
}

#[cfg(windows)]
pub(crate) fn inspect_backend_process(pid: u32) -> Option<BackendProcessIdentity> {
    windows_process_inspection::inspect(pid)
}

#[cfg(not(any(target_os = "macos", windows)))]
pub(crate) fn inspect_backend_process(_pid: u32) -> Option<BackendProcessIdentity> {
    None
}

#[cfg(target_os = "macos")]
mod macos_process_inspection {
    use super::BackendProcessIdentity;
    use std::ffi::c_void;
    use std::mem::{size_of, MaybeUninit};
    use std::path::PathBuf;
    use std::ptr;

    const PROC_PIDTBSDINFO: i32 = 3;
    const PROC_PIDPATHINFO_MAXSIZE: usize = 4_096;
    const CTL_KERN: i32 = 1;
    const KERN_ARGMAX: i32 = 8;
    const KERN_PROCARGS2: i32 = 49;
    const MAX_PROCESS_ARGUMENT_BYTES: usize = 4 * 1_024 * 1_024;

    #[repr(C)]
    struct ProcBsdInfo {
        pbi_flags: u32,
        pbi_status: u32,
        pbi_xstatus: u32,
        pbi_pid: u32,
        pbi_ppid: u32,
        pbi_uid: u32,
        pbi_gid: u32,
        pbi_ruid: u32,
        pbi_rgid: u32,
        pbi_svuid: u32,
        pbi_svgid: u32,
        rfu_1: u32,
        pbi_comm: [u8; 16],
        pbi_name: [u8; 32],
        pbi_nfiles: u32,
        pbi_pgid: u32,
        pbi_pjobc: u32,
        e_tdev: u32,
        e_tpgid: u32,
        pbi_nice: i32,
        pbi_start_tvsec: u64,
        pbi_start_tvusec: u64,
    }

    #[link(name = "proc")]
    extern "C" {
        fn proc_pidpath(pid: i32, buffer: *mut c_void, buffersize: u32) -> i32;
        fn proc_pidinfo(
            pid: i32,
            flavor: i32,
            arg: u64,
            buffer: *mut c_void,
            buffersize: i32,
        ) -> i32;
    }

    pub(super) fn inspect(pid: u32) -> Option<BackendProcessIdentity> {
        if pid <= 1 || pid > i32::MAX as u32 {
            return None;
        }
        let mut path_buffer = vec![0u8; PROC_PIDPATHINFO_MAXSIZE];
        // SAFETY: the buffer is live and writable for the declared byte length.
        let path_length = unsafe {
            proc_pidpath(
                pid as i32,
                path_buffer.as_mut_ptr().cast::<c_void>(),
                path_buffer.len() as u32,
            )
        };
        if path_length <= 0 {
            return None;
        }
        let path_bytes = path_buffer.get(..path_length as usize)?;
        let path_end = path_bytes
            .iter()
            .position(|byte| *byte == 0)
            .unwrap_or(path_bytes.len());
        let executable_path = PathBuf::from(std::str::from_utf8(&path_bytes[..path_end]).ok()?);
        if !executable_path.is_absolute() {
            return None;
        }

        let mut info = MaybeUninit::<ProcBsdInfo>::zeroed();
        // SAFETY: proc_pidinfo writes at most the exact initialized struct size.
        let info_length = unsafe {
            proc_pidinfo(
                pid as i32,
                PROC_PIDTBSDINFO,
                0,
                info.as_mut_ptr().cast::<c_void>(),
                size_of::<ProcBsdInfo>() as i32,
            )
        };
        if info_length != size_of::<ProcBsdInfo>() as i32 {
            return None;
        }
        // SAFETY: a full ProcBsdInfo was written, as checked above.
        let info = unsafe { info.assume_init() };
        if info.pbi_pid != pid {
            return None;
        }
        let started_at_ms = info
            .pbi_start_tvsec
            .checked_mul(1_000)?
            .checked_add(info.pbi_start_tvusec / 1_000)?;
        let arguments = read_process_arguments(pid)?;

        Some(BackendProcessIdentity {
            pid,
            parent_pid: info.pbi_ppid,
            started_at_ms,
            executable_path,
            arguments,
        })
    }

    fn read_process_arguments(pid: u32) -> Option<Vec<String>> {
        let mut arg_max: i32 = 0;
        let mut arg_max_size = size_of::<i32>();
        let mut arg_max_mib = [CTL_KERN, KERN_ARGMAX];
        // SAFETY: sysctl receives valid MIB and output buffers with their exact lengths.
        let arg_max_result = unsafe {
            libc::sysctl(
                arg_max_mib.as_mut_ptr(),
                arg_max_mib.len() as u32,
                (&mut arg_max as *mut i32).cast::<c_void>(),
                &mut arg_max_size,
                ptr::null_mut(),
                0,
            )
        };
        if arg_max_result != 0 || arg_max <= 0 || arg_max as usize > MAX_PROCESS_ARGUMENT_BYTES {
            return None;
        }
        let mut bytes = vec![0u8; arg_max as usize];
        let mut bytes_len = bytes.len();
        let mut process_args_mib = [CTL_KERN, KERN_PROCARGS2, pid as i32];
        // SAFETY: sysctl receives valid MIB and a writable output buffer.
        let args_result = unsafe {
            libc::sysctl(
                process_args_mib.as_mut_ptr(),
                process_args_mib.len() as u32,
                bytes.as_mut_ptr().cast::<c_void>(),
                &mut bytes_len,
                ptr::null_mut(),
                0,
            )
        };
        if args_result != 0 || bytes_len < size_of::<i32>() || bytes_len > bytes.len() {
            return None;
        }
        bytes.truncate(bytes_len);
        parse_process_arguments(bytes.as_slice())
    }

    fn parse_process_arguments(bytes: &[u8]) -> Option<Vec<String>> {
        let argc = i32::from_ne_bytes(bytes.get(..4)?.try_into().ok()?);
        if !(1..=4_096).contains(&argc) {
            return None;
        }
        let mut cursor = 4usize;
        while *bytes.get(cursor)? != 0 {
            cursor += 1;
        }
        while bytes.get(cursor) == Some(&0) {
            cursor += 1;
        }

        let mut arguments = Vec::with_capacity(argc as usize);
        for _ in 0..argc {
            let start = cursor;
            while *bytes.get(cursor)? != 0 {
                cursor += 1;
            }
            arguments.push(std::str::from_utf8(&bytes[start..cursor]).ok()?.to_string());
            cursor += 1;
        }
        Some(arguments)
    }

    #[cfg(test)]
    mod tests {
        use super::{inspect, parse_process_arguments};

        #[test]
        fn parses_kern_procargs2_argument_prefix() {
            let mut bytes = 3i32.to_ne_bytes().to_vec();
            bytes.extend_from_slice(
                b"/bundle/node\0\0/bundle/node\0/bundle/index.js\0--flag\0ENV=x\0",
            );
            assert_eq!(
                parse_process_arguments(bytes.as_slice()),
                Some(vec![
                    "/bundle/node".to_string(),
                    "/bundle/index.js".to_string(),
                    "--flag".to_string(),
                ])
            );
        }

        #[test]
        fn inspects_current_macos_process_with_native_identity_sources() {
            let identity = inspect(std::process::id()).expect("inspect current process");
            assert_eq!(identity.pid, std::process::id());
            assert!(identity.parent_pid > 0);
            assert!(identity.started_at_ms > 0);
            assert!(identity.executable_path.is_absolute());
            assert!(!identity.arguments.is_empty());
        }
    }
}

#[cfg(windows)]
mod windows_process_inspection {
    use super::{parse_windows_command_line, BackendProcessIdentity};
    use std::path::PathBuf;
    use std::process::{Command, Stdio};
    use std::thread;
    use std::time::{Duration, Instant};

    use std::os::windows::process::CommandExt;

    const WINDOWS_CREATE_NO_WINDOW: u32 = 0x08000000;
    const PROCESS_INSPECTION_TIMEOUT: Duration = Duration::from_secs(3);

    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct WindowsProcessRecord {
        pid: u32,
        parent_pid: u32,
        executable_path: String,
        command_line: String,
        started_at_ms: u64,
    }

    pub(super) fn inspect(pid: u32) -> Option<BackendProcessIdentity> {
        if pid <= 1 {
            return None;
        }
        let system_root = std::env::var_os("SystemRoot")?;
        let powershell = PathBuf::from(system_root)
            .join("System32")
            .join("WindowsPowerShell")
            .join("v1.0")
            .join("powershell.exe");
        if !powershell.is_file() {
            return None;
        }
        let script = format!(
            "$p=Get-CimInstance Win32_Process -Filter 'ProcessId = {pid}';if($null -eq $p){{exit 3}};$s=[DateTimeOffset](Get-Process -Id {pid} -ErrorAction Stop).StartTime.ToUniversalTime();[pscustomobject]@{{pid=[uint32]$p.ProcessId;parentPid=[uint32]$p.ParentProcessId;executablePath=[string]$p.ExecutablePath;commandLine=[string]$p.CommandLine;startedAtMs=$s.ToUnixTimeMilliseconds()}}|ConvertTo-Json -Compress"
        );
        let mut child = Command::new(powershell)
            .args([
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                script.as_str(),
            ])
            .creation_flags(WINDOWS_CREATE_NO_WINDOW)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .ok()?;
        let started_at = Instant::now();
        loop {
            match child.try_wait() {
                Ok(Some(status)) => {
                    let output = child.wait_with_output().ok()?;
                    if !status.success() || output.stdout.len() > 64 * 1_024 {
                        return None;
                    }
                    let record =
                        serde_json::from_slice::<WindowsProcessRecord>(&output.stdout).ok()?;
                    let executable_path = PathBuf::from(record.executable_path);
                    let arguments = parse_windows_command_line(record.command_line.as_str())?;
                    return Some(BackendProcessIdentity {
                        pid: record.pid,
                        parent_pid: record.parent_pid,
                        started_at_ms: record.started_at_ms,
                        executable_path,
                        arguments,
                    });
                }
                Ok(None) => {}
                Err(_) => return None,
            }
            if started_at.elapsed() >= PROCESS_INSPECTION_TIMEOUT {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
            thread::sleep(Duration::from_millis(25));
        }
    }
}

#[cfg(any(windows, test))]
fn parse_windows_command_line(command_line: &str) -> Option<Vec<String>> {
    if command_line.is_empty() || command_line.len() > 64 * 1_024 {
        return None;
    }
    let chars: Vec<char> = command_line.chars().collect();
    let mut arguments = Vec::new();
    let mut cursor = 0usize;
    while cursor < chars.len() {
        while cursor < chars.len() && (chars[cursor] == ' ' || chars[cursor] == '\t') {
            cursor += 1;
        }
        if cursor >= chars.len() {
            break;
        }
        let mut argument = String::new();
        let mut in_quotes = false;
        while cursor < chars.len() {
            if !in_quotes && (chars[cursor] == ' ' || chars[cursor] == '\t') {
                break;
            }
            let mut backslashes = 0usize;
            while cursor < chars.len() && chars[cursor] == '\\' {
                backslashes += 1;
                cursor += 1;
            }
            if cursor < chars.len() && chars[cursor] == '"' {
                argument.extend(std::iter::repeat_n('\\', backslashes / 2));
                if backslashes % 2 == 1 {
                    argument.push('"');
                    cursor += 1;
                } else if in_quotes && cursor + 1 < chars.len() && chars[cursor + 1] == '"' {
                    argument.push('"');
                    cursor += 2;
                } else {
                    in_quotes = !in_quotes;
                    cursor += 1;
                }
                continue;
            }
            argument.extend(std::iter::repeat_n('\\', backslashes));
            if cursor < chars.len() {
                argument.push(chars[cursor]);
                cursor += 1;
            }
        }
        if in_quotes {
            return None;
        }
        arguments.push(argument);
    }
    (!arguments.is_empty()).then_some(arguments)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn process() -> BackendProcessIdentity {
        BackendProcessIdentity {
            pid: 42,
            parent_pid: 1,
            started_at_ms: 1_000_000,
            executable_path: PathBuf::from("/Applications/Zinuto.app/Contents/MacOS/zinuto-node"),
            arguments: vec![
                "/Applications/Zinuto.app/Contents/MacOS/zinuto-node".to_string(),
                "/Applications/Zinuto.app/Contents/Resources/apps/desktop/local-api/dist/runtime/index.js"
                    .to_string(),
            ],
        }
    }

    fn endpoint() -> BackendOrphanEndpointEvidence {
        BackendOrphanEndpointEvidence::UnauthorizedBridgeTokenMismatch
    }

    fn validation<'a>(
        process: &'a BackendProcessIdentity,
        endpoint: &'a BackendOrphanEndpointEvidence,
        entries: &'a [PathBuf],
    ) -> BackendOrphanValidation<'a> {
        BackendOrphanValidation {
            state_pid: 42,
            state_parent_pid: Some(20),
            state_started_at_ms: Some(1_001_000),
            state_runtime_build_id: "historical-build:1",
            state_release_channel: Some("direct"),
            current_app_pid: 99,
            current_release_channel: "direct",
            state_parent_is_live: false,
            process,
            expected_node_runtime: Path::new("/Applications/Zinuto.app/Contents/MacOS/zinuto-node"),
            expected_backend_entries: entries,
            endpoint,
            now_ms: 2_000_000,
            max_state_write_delay_ms: 86_700_000,
            allow_init_reparent: true,
            case_insensitive_paths: false,
        }
    }

    fn entries() -> Vec<PathBuf> {
        vec![PathBuf::from(
            "/Applications/Zinuto.app/Contents/Resources/apps/desktop/local-api/dist/runtime/index.js",
        )]
    }

    #[test]
    fn accepts_historical_orphan_with_exact_identity_and_unauthorized_endpoint() {
        let process = process();
        let endpoint = endpoint();
        let entries = entries();
        assert_eq!(
            validate_backend_orphan_identity(&validation(&process, &endpoint, &entries)),
            Ok(())
        );
    }

    #[test]
    fn accepts_authenticated_health_only_when_it_matches_historical_state() {
        let process = process();
        let entries = entries();
        let endpoint = BackendOrphanEndpointEvidence::AuthenticatedHealth {
            status: "UP".to_string(),
            pid: 42,
            runtime_build_id: "historical-build:1".to_string(),
        };
        assert_eq!(
            validate_backend_orphan_identity(&validation(&process, &endpoint, &entries)),
            Ok(())
        );
    }

    #[test]
    fn rejects_live_parent_wrong_channel_and_unverified_endpoint() {
        let process = process();
        let endpoint = endpoint();
        let entries = entries();
        let mut input = validation(&process, &endpoint, &entries);
        input.state_parent_is_live = true;
        assert_eq!(
            validate_backend_orphan_identity(&input),
            Err(BackendOrphanValidationError::StateParentStillLive)
        );

        let mut input = validation(&process, &endpoint, &entries);
        input.state_release_channel = Some("not-community");
        assert_eq!(
            validate_backend_orphan_identity(&input),
            Err(BackendOrphanValidationError::ReleaseChannelMismatch)
        );

        let mut input = validation(&process, &endpoint, &entries);
        input.state_release_channel = None;
        assert_eq!(
            validate_backend_orphan_identity(&input),
            Err(BackendOrphanValidationError::ReleaseChannelMismatch)
        );

        let unverified = BackendOrphanEndpointEvidence::Unverified;
        let input = validation(&process, &unverified, &entries);
        assert_eq!(
            validate_backend_orphan_identity(&input),
            Err(BackendOrphanValidationError::EndpointUnverified)
        );
    }

    #[test]
    fn rejects_pid_reuse_timing_and_process_identity_mismatches() {
        let endpoint = endpoint();
        let entries = entries();
        let mut reused_process = process();
        reused_process.started_at_ms = 1_020_000;
        let input = validation(&reused_process, &endpoint, &entries);
        assert_eq!(
            validate_backend_orphan_identity(&input),
            Err(BackendOrphanValidationError::ProcessStartedAfterState)
        );

        let mut wrong_executable = process();
        wrong_executable.executable_path = PathBuf::from("/usr/local/bin/node");
        let input = validation(&wrong_executable, &endpoint, &entries);
        assert_eq!(
            validate_backend_orphan_identity(&input),
            Err(BackendOrphanValidationError::ExecutablePathMismatch)
        );

        let mut wrong_entry = process();
        wrong_entry.arguments[1] = "/tmp/index.js".to_string();
        let input = validation(&wrong_entry, &endpoint, &entries);
        assert_eq!(
            validate_backend_orphan_identity(&input),
            Err(BackendOrphanValidationError::BackendEntryArgumentMismatch)
        );

        let mut wrong_argv_zero = process();
        wrong_argv_zero.arguments[0] = "/usr/local/bin/node".to_string();
        let input = validation(&wrong_argv_zero, &endpoint, &entries);
        assert_eq!(
            validate_backend_orphan_identity(&input),
            Err(BackendOrphanValidationError::ProcessExecutableArgumentMismatch)
        );
    }

    #[test]
    fn rejects_missing_or_implausible_state_start_time() {
        let process = process();
        let endpoint = endpoint();
        let entries = entries();
        let mut input = validation(&process, &endpoint, &entries);
        input.state_started_at_ms = None;
        assert_eq!(
            validate_backend_orphan_identity(&input),
            Err(BackendOrphanValidationError::InvalidStateStartedAt)
        );

        let mut input = validation(&process, &endpoint, &entries);
        input.state_started_at_ms = Some(input.now_ms + ORPHAN_CLOCK_SKEW_MS + 1);
        assert_eq!(
            validate_backend_orphan_identity(&input),
            Err(BackendOrphanValidationError::InvalidStateStartedAt)
        );

        let mut input = validation(&process, &endpoint, &entries);
        input.state_started_at_ms =
            Some(process.started_at_ms + input.max_state_write_delay_ms + 1);
        input.now_ms = input.state_started_at_ms.unwrap();
        assert_eq!(
            validate_backend_orphan_identity(&input),
            Err(BackendOrphanValidationError::StateWriteDelayExceeded)
        );
    }

    #[test]
    fn init_reparent_requires_explicit_platform_allowance() {
        let process = process();
        let endpoint = endpoint();
        let entries = entries();
        let mut input = validation(&process, &endpoint, &entries);
        input.allow_init_reparent = false;
        assert_eq!(
            validate_backend_orphan_identity(&input),
            Err(BackendOrphanValidationError::ProcessParentMismatch)
        );
    }

    #[test]
    fn authenticated_health_rejects_pid_and_build_mismatches() {
        let process = process();
        let entries = entries();
        let wrong_pid = BackendOrphanEndpointEvidence::AuthenticatedHealth {
            status: "UP".to_string(),
            pid: 43,
            runtime_build_id: "historical-build:1".to_string(),
        };
        assert_eq!(
            validate_backend_orphan_identity(&validation(&process, &wrong_pid, &entries)),
            Err(BackendOrphanValidationError::HealthPidMismatch)
        );

        let wrong_build = BackendOrphanEndpointEvidence::AuthenticatedHealth {
            status: "UP".to_string(),
            pid: 42,
            runtime_build_id: "current-build:2".to_string(),
        };
        assert_eq!(
            validate_backend_orphan_identity(&validation(&process, &wrong_build, &entries)),
            Err(BackendOrphanValidationError::HealthBuildIdMismatch)
        );
    }

    #[test]
    fn parses_quoted_windows_node_and_script_paths() {
        assert_eq!(
            parse_windows_command_line(
                r#""C:\Program Files\Zinuto\zinuto-node.exe" "C:\Program Files\Zinuto\runtime\index.js" --flag"#,
            ),
            Some(vec![
                r"C:\Program Files\Zinuto\zinuto-node.exe".to_string(),
                r"C:\Program Files\Zinuto\runtime\index.js".to_string(),
                "--flag".to_string(),
            ])
        );
    }

    #[test]
    fn matches_windows_identity_paths_case_insensitively() {
        assert!(identity_paths_match(
            Path::new(r"\\?\C:\Program Files\Zinuto\ZINUTO-NODE.EXE"),
            Path::new(r"c:/program files/zinuto/zinuto-node.exe"),
            true,
        ));
    }

    #[test]
    fn accepts_historical_windows_packaged_install_paths() {
        let process = BackendProcessIdentity {
            pid: 42,
            parent_pid: 20,
            started_at_ms: 1_000_000,
            executable_path: PathBuf::from(r"C:\Program Files\Zinuto\node-runtime\node.exe"),
            arguments: vec![
                r"C:\Program Files\Zinuto\node-runtime\node.exe".to_string(),
                r"C:\Program Files\Zinuto\apps\desktop\local-api\dist\runtime\index.js".to_string(),
            ],
        };
        let endpoint = endpoint();
        let entries = vec![PathBuf::from(
            r"c:\program files\zinuto\apps\desktop\local-api\dist\runtime\index.js",
        )];
        let mut input = validation(&process, &endpoint, &entries);
        input.expected_node_runtime = Path::new(r"c:\program files\zinuto\node-runtime\node.exe");
        input.allow_init_reparent = false;
        input.case_insensitive_paths = true;

        assert_eq!(validate_backend_orphan_identity(&input), Ok(()));
    }
}

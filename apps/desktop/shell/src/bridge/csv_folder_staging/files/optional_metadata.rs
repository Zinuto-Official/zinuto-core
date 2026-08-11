// SPDX-License-Identifier: GPL-3.0-only

use super::create_private_target_file;
use std::ffi::OsStr;
use std::fs;
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};

const OPTIONAL_SOURCE_METADATA_FILE_NAME: &str = "SOURCE.md";
pub(super) const OPTIONAL_SOURCE_METADATA_MAX_BYTES: u64 = 64 * 1024;

pub(super) struct OptionalSourceMetadataSnapshot {
    file_path: PathBuf,
    metadata: fs::Metadata,
    identity: FileIdentity,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(super) struct FileIdentity {
    #[cfg(unix)]
    device: u64,
    #[cfg(unix)]
    inode: u64,
    #[cfg(windows)]
    volume_serial_number: u32,
    #[cfg(windows)]
    file_index: u64,
}

#[cfg(unix)]
pub(super) fn file_identity(file: &fs::File) -> io::Result<FileIdentity> {
    use std::os::unix::fs::MetadataExt;
    let metadata = file.metadata()?;
    Ok(FileIdentity {
        device: metadata.dev(),
        inode: metadata.ino(),
    })
}

#[cfg(windows)]
pub(super) fn file_identity(file: &fs::File) -> io::Result<FileIdentity> {
    use std::mem::MaybeUninit;
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::Storage::FileSystem::{
        GetFileInformationByHandle, BY_HANDLE_FILE_INFORMATION,
    };

    let mut information = MaybeUninit::<BY_HANDLE_FILE_INFORMATION>::zeroed();
    // SAFETY: file owns a valid handle for the duration of this call and the
    // output points to writable storage for BY_HANDLE_FILE_INFORMATION.
    let succeeded =
        unsafe { GetFileInformationByHandle(file.as_raw_handle(), information.as_mut_ptr()) };
    if succeeded == 0 {
        return Err(io::Error::last_os_error());
    }
    // SAFETY: GetFileInformationByHandle initialized the structure on success.
    let information = unsafe { information.assume_init() };
    Ok(FileIdentity {
        volume_serial_number: information.dwVolumeSerialNumber,
        file_index: ((information.nFileIndexHigh as u64) << 32) | information.nFileIndexLow as u64,
    })
}

#[cfg(not(any(unix, windows)))]
pub(super) fn file_identity(_file: &fs::File) -> io::Result<FileIdentity> {
    Ok(FileIdentity {})
}

fn metadata_matches_snapshot(
    metadata: &fs::Metadata,
    snapshot: &OptionalSourceMetadataSnapshot,
) -> bool {
    if !metadata.is_file()
        || metadata.len() != snapshot.metadata.len()
        || metadata.len() > OPTIONAL_SOURCE_METADATA_MAX_BYTES
    {
        return false;
    }
    match snapshot.metadata.modified().ok() {
        Some(expected) => metadata
            .modified()
            .map(|actual| actual == expected)
            .unwrap_or(false),
        None => true,
    }
}

fn opened_file_matches_snapshot(
    file: &fs::File,
    snapshot: &OptionalSourceMetadataSnapshot,
) -> bool {
    file.metadata()
        .map(|metadata| metadata_matches_snapshot(&metadata, snapshot))
        .unwrap_or(false)
        && file_identity(file)
            .map(|identity| identity == snapshot.identity)
            .unwrap_or(false)
}

fn path_matches_snapshot(path: &Path, snapshot: &OptionalSourceMetadataSnapshot) -> bool {
    let Ok(link_metadata) = fs::symlink_metadata(path) else {
        return false;
    };
    if link_metadata.file_type().is_symlink()
        || !metadata_matches_snapshot(&link_metadata, snapshot)
    {
        return false;
    }
    open_regular_file_without_following_links(path)
        .map(|file| opened_file_matches_snapshot(&file, snapshot))
        .unwrap_or(false)
}

pub(super) fn discover_optional_source_metadata_snapshot(
    source_dir: &Path,
) -> Option<OptionalSourceMetadataSnapshot> {
    let entry = fs::read_dir(source_dir).ok()?.find_map(|entry| {
        let entry = entry.ok()?;
        (entry.file_name() == OsStr::new(OPTIONAL_SOURCE_METADATA_FILE_NAME)).then_some(entry)
    })?;
    let file_path = entry.path();
    let link_metadata = fs::symlink_metadata(&file_path).ok()?;
    if link_metadata.file_type().is_symlink()
        || !link_metadata.is_file()
        || link_metadata.len() > OPTIONAL_SOURCE_METADATA_MAX_BYTES
    {
        return None;
    }
    let file = open_regular_file_without_following_links(&file_path).ok()?;
    let metadata = file.metadata().ok()?;
    if !metadata.is_file() || metadata.len() > OPTIONAL_SOURCE_METADATA_MAX_BYTES {
        return None;
    }
    Some(OptionalSourceMetadataSnapshot {
        file_path,
        metadata,
        identity: file_identity(&file).ok()?,
    })
}

#[cfg(unix)]
pub(super) fn open_regular_file_without_following_links(path: &Path) -> io::Result<fs::File> {
    use std::os::unix::fs::OpenOptionsExt;
    fs::OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_NOFOLLOW)
        .open(path)
}

#[cfg(windows)]
pub(super) fn open_regular_file_without_following_links(path: &Path) -> io::Result<fs::File> {
    use std::os::windows::fs::OpenOptionsExt;
    use windows_sys::Win32::Storage::FileSystem::FILE_FLAG_OPEN_REPARSE_POINT;
    fs::OpenOptions::new()
        .read(true)
        .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT)
        .open(path)
}

#[cfg(not(any(unix, windows)))]
pub(super) fn open_regular_file_without_following_links(path: &Path) -> io::Result<fs::File> {
    fs::File::open(path)
}

pub(super) fn copy_optional_source_metadata_entry(
    snapshot: &OptionalSourceMetadataSnapshot,
    target_path: &Path,
) -> Option<()> {
    if !path_matches_snapshot(&snapshot.file_path, snapshot) {
        return None;
    }

    let mut source_file = open_regular_file_without_following_links(&snapshot.file_path).ok()?;
    if !opened_file_matches_snapshot(&source_file, snapshot) {
        return None;
    }

    let mut content = Vec::with_capacity(snapshot.metadata.len() as usize);
    {
        let mut bounded_reader = (&mut source_file).take(snapshot.metadata.len().saturating_add(1));
        bounded_reader.read_to_end(&mut content).ok()?;
    }
    if content.len() as u64 != snapshot.metadata.len() {
        return None;
    }

    if !path_matches_snapshot(&snapshot.file_path, snapshot)
        || !opened_file_matches_snapshot(&source_file, snapshot)
    {
        return None;
    }

    let mut target_file = create_private_target_file(target_path).ok()?;
    target_file.write_all(&content).ok()?;
    if !target_file
        .metadata()
        .map(|metadata| metadata.is_file() && metadata.len() == snapshot.metadata.len())
        .unwrap_or(false)
    {
        return None;
    }

    if !path_matches_snapshot(&snapshot.file_path, snapshot)
        || !opened_file_matches_snapshot(&source_file, snapshot)
    {
        return None;
    }
    Some(())
}

pub(super) fn copy_optional_source_metadata_snapshot(source_dir: &Path, staging_dir: &Path) {
    let Some(snapshot) = discover_optional_source_metadata_snapshot(source_dir) else {
        return;
    };
    let target_path = staging_dir.join(OPTIONAL_SOURCE_METADATA_FILE_NAME);
    if copy_optional_source_metadata_entry(&snapshot, &target_path).is_none() {
        let _ = fs::remove_file(target_path);
    }
}

// SPDX-License-Identifier: GPL-3.0-only

use std::env;
use std::ffi::OsString;
#[cfg(target_os = "macos")]
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

fn main() {
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-changed=../../../tools/release/ensure-tauri-build-inputs.mjs");
    println!("cargo:rerun-if-changed=../../../tools/release/prepare-tauri-build.mjs");
    println!("cargo:rerun-if-changed=../../../tools/release/prepare-node-runtime-libs.mjs");
    println!("cargo:rerun-if-changed=../../../tools/release/prepare-backend-runtime-bundle.mjs");
    println!("cargo:rerun-if-changed=../../../tools/release/desktop-runtime-layout.mjs");
    println!("cargo:rerun-if-changed=tauri.conf.json");
    println!("cargo:rerun-if-changed=tauri.windows.conf.json");
    println!("cargo:rerun-if-changed=icons/status-bar-template.png");
    println!("cargo:rerun-if-changed=nsis/windows-runtime-resources.nsh");
    ensure_tauri_build_inputs();
    #[cfg(target_os = "macos")]
    reset_tauri_dependency_build_cache_if_workspace_moved();
    tauri_build::build()
}

fn repo_root_from_manifest_dir(manifest_dir: &Path) -> PathBuf {
    manifest_dir
        .parent()
        .and_then(|path| path.parent())
        .and_then(|path| path.parent())
        .expect("apps/desktop/shell should live under the workspace root")
        .to_path_buf()
}

#[cfg(target_os = "macos")]
fn reset_tauri_dependency_build_cache_if_workspace_moved() {
    let out_dir = PathBuf::from(
        env::var("OUT_DIR").expect("OUT_DIR is unavailable during Tauri dependency cache check"),
    );
    let current_package_build_dir = out_dir
        .parent()
        .expect("OUT_DIR should live under target/<profile>/build/<pkg>/out")
        .to_path_buf();
    let target_profile_dir = current_package_build_dir
        .parent()
        .expect("build dir should live under target/<profile>")
        .to_path_buf();

    // Only this crate's own build directory is ever cleaned. Other crates'
    // artifacts are left untouched even when their recorded OUT_DIR looks
    // stale: their own build scripts own that decision.
    let recorded_out_dir = current_package_build_dir.join("root-output");
    let expected_out_dir = current_package_build_dir.join("out");
    let Ok(recorded_out_dir_text) = fs::read_to_string(&recorded_out_dir) else {
        return;
    };
    if recorded_out_dir_text.trim() == expected_out_dir.to_string_lossy() {
        return;
    }

    let package_name = current_package_build_dir
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_owned();
    let stale_prefix = stale_dependency_prefix(&package_name);
    let _ = fs::remove_dir_all(&current_package_build_dir);
    let fingerprint_dir = target_profile_dir.join(".fingerprint");
    if let Ok(entries) = fs::read_dir(&fingerprint_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let dir_name = entry.file_name();
            let dir_name = dir_name.to_string_lossy();
            if dir_name.starts_with(stale_prefix.as_str()) {
                let _ = fs::remove_dir_all(path);
            }
        }
    }

    panic!(
        "detected stale build cache from a different workspace path; cleaned this crate's build artifacts. Please rerun the build."
    );
}

#[cfg(target_os = "macos")]
fn stale_dependency_prefix(dir_name: &str) -> String {
    dir_name
        .rsplit_once('-')
        .map(|(prefix, _)| prefix.to_owned())
        .unwrap_or_else(|| dir_name.to_owned())
}

fn ensure_tauri_build_inputs() {
    let manifest_dir = PathBuf::from(
        env::var("CARGO_MANIFEST_DIR")
            .expect("CARGO_MANIFEST_DIR is unavailable during Tauri build"),
    );
    let workspace_root = repo_root_from_manifest_dir(&manifest_dir);
    let ensure_script_path = workspace_root.join("tools/release/ensure-tauri-build-inputs.mjs");
    let node_binary = resolve_node_binary(&workspace_root);

    let status = Command::new(&node_binary)
        .arg(&ensure_script_path)
        .current_dir(&workspace_root)
        .status()
        .unwrap_or_else(|error| {
            panic!(
                "failed to launch {:?} for {:?}: {}",
                node_binary, ensure_script_path, error
            )
        });

    if !status.success() {
        panic!(
            "failed to prepare Tauri build inputs via {:?}; run `npm run desktop:build` or build the missing desktop web/local-api assets first",
            ensure_script_path
        );
    }
}

fn resolve_node_binary(workspace_root: &Path) -> OsString {
    let bundled_candidates = [
        workspace_root.join("apps/desktop/shell/runtime/node/bin/node"),
        workspace_root.join("apps/desktop/shell/runtime/node/bin/node.exe"),
    ];
    for candidate in bundled_candidates {
        if candidate.is_file() {
            return candidate.into_os_string();
        }
    }

    for key in ["NODE_BINARY", "NODE", "npm_node_execpath"] {
        if let Some(value) = env::var_os(key) {
            if !value.is_empty() {
                return value;
            }
        }
    }

    OsString::from("node")
}

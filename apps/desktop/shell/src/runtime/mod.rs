// SPDX-License-Identifier: GPL-3.0-only

mod backend_orphan;
pub(crate) mod backend_runtime;
mod backend_startup_circuit;
mod backend_startup_progress;
pub(crate) mod main_webview_busy;

#[cfg(target_os = "macos")]
pub(crate) mod watchdog;

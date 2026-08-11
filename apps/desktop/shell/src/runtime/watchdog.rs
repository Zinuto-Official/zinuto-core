// SPDX-License-Identifier: GPL-3.0-only

#[cfg(target_os = "macos")]
use std::sync::mpsc;
#[cfg(target_os = "macos")]
use std::thread;
#[cfg(target_os = "macos")]
use std::time::{Duration, Instant};

#[cfg(target_os = "macos")]
use block2::RcBlock;
#[cfg(target_os = "macos")]
use objc2::runtime::AnyObject;
#[cfg(target_os = "macos")]
use objc2_foundation::{NSError, NSString};
#[cfg(target_os = "macos")]
use objc2_web_kit::WKWebView;
#[cfg(target_os = "macos")]
use tauri::Manager;

#[cfg(target_os = "macos")]
use crate::runtime::backend_runtime;

#[cfg(target_os = "macos")]
const MAIN_WEBVIEW_WATCHDOG_INTERVAL: Duration = Duration::from_secs(3);
#[cfg(target_os = "macos")]
const MAIN_WEBVIEW_WATCHDOG_STARTUP_GRACE: Duration = Duration::from_secs(30);
#[cfg(target_os = "macos")]
const MAIN_WEBVIEW_WATCHDOG_RELOAD_COOLDOWN: Duration = Duration::from_secs(30);
#[cfg(target_os = "macos")]
const MAIN_WEBVIEW_WATCHDOG_RESPONSE_TIMEOUT: Duration = Duration::from_millis(2500);
#[cfg(target_os = "macos")]
const MAIN_WEBVIEW_WATCHDOG_RELOAD_CONFIRM_TIMEOUT: Duration = Duration::from_secs(6);
#[cfg(target_os = "macos")]
const MAIN_WEBVIEW_NATIVE_STATE_TIMEOUT: Duration = Duration::from_millis(250);
#[cfg(target_os = "macos")]
const MAIN_WEBVIEW_WATCHDOG_FAILURE_THRESHOLD: u8 = 4;
#[cfg(target_os = "macos")]
const MAIN_WEBVIEW_HEARTBEAT_SCRIPT: &str = "window.__ZINUTO_WEBVIEW_HEARTBEAT__ = Date.now();";

#[cfg(target_os = "macos")]
#[derive(Clone, Copy)]
struct MainWebviewNativeState {
    is_loading: bool,
    estimated_progress: f64,
}

#[cfg(target_os = "macos")]
fn ping_main_webview(window: &tauri::WebviewWindow, timeout: Duration) -> bool {
    let (sender, receiver) = mpsc::channel::<bool>();
    let script = MAIN_WEBVIEW_HEARTBEAT_SCRIPT.to_string();
    // SAFETY: Tauri supplies a live WKWebView pointer for the duration of with_webview.
    let with_webview_result = window.with_webview(move |platform_webview| unsafe {
        let webview: &WKWebView = &*platform_webview.inner().cast();
        let script = NSString::from_str(script.as_str());
        let completion = RcBlock::new(move |_value: *mut AnyObject, error: *mut NSError| {
            let _ = sender.send(error.is_null());
        });
        webview.evaluateJavaScript_completionHandler(&script, Some(&completion));
    });

    if with_webview_result.is_err() {
        return false;
    }

    receiver.recv_timeout(timeout).unwrap_or(false)
}

#[cfg(target_os = "macos")]
fn read_main_webview_native_state(window: &tauri::WebviewWindow) -> Option<MainWebviewNativeState> {
    let (sender, receiver) = mpsc::channel::<MainWebviewNativeState>();
    // SAFETY: Tauri supplies a live WKWebView pointer for the duration of with_webview.
    let with_webview_result = window.with_webview(move |platform_webview| unsafe {
        let webview: &WKWebView = &*platform_webview.inner().cast();
        let _ = sender.send(MainWebviewNativeState {
            is_loading: webview.isLoading(),
            estimated_progress: webview.estimatedProgress(),
        });
    });

    if with_webview_result.is_err() {
        return None;
    }

    receiver
        .recv_timeout(MAIN_WEBVIEW_NATIVE_STATE_TIMEOUT)
        .ok()
}

#[cfg(target_os = "macos")]
fn should_pause_main_webview_watchdog(window: &tauri::WebviewWindow) -> bool {
    if window.is_visible().ok() == Some(false) {
        return true;
    }
    if window.is_minimized().ok() == Some(true) {
        return true;
    }
    // A visible, non-minimized window must keep its webview watchdog active even
    // when another application has focus.  App blur is not evidence that the
    // webview is unavailable, and pausing here would erase the failure streak.
    read_main_webview_native_state(window)
        .map(|state| state.is_loading)
        .unwrap_or(false)
}

#[cfg(target_os = "macos")]
pub(crate) fn spawn_main_webview_watchdog(app: &tauri::AppHandle) {
    let app_handle = app.clone();
    thread::spawn(move || {
        let started_at = Instant::now();
        let mut consecutive_failures = 0u8;
        let mut last_reload_at: Option<Instant> = None;

        loop {
            thread::sleep(MAIN_WEBVIEW_WATCHDOG_INTERVAL);

            if backend_runtime::backend_shutdown_requested(&app_handle) {
                break;
            }

            if started_at.elapsed() < MAIN_WEBVIEW_WATCHDOG_STARTUP_GRACE {
                continue;
            }

            let Some(window) = app_handle.get_webview_window("main") else {
                continue;
            };

            if should_pause_main_webview_watchdog(&window) {
                consecutive_failures = 0;
                continue;
            }

            if ping_main_webview(&window, MAIN_WEBVIEW_WATCHDOG_RESPONSE_TIMEOUT) {
                consecutive_failures = 0;
                continue;
            }

            consecutive_failures = consecutive_failures.saturating_add(1);
            eprintln!(
                "[zinuto] main webview heartbeat failed (attempt {})",
                consecutive_failures
            );

            let can_reload = last_reload_at
                .map(|instant| instant.elapsed() >= MAIN_WEBVIEW_WATCHDOG_RELOAD_COOLDOWN)
                .unwrap_or(true);
            if consecutive_failures < MAIN_WEBVIEW_WATCHDOG_FAILURE_THRESHOLD || !can_reload {
                continue;
            }

            if should_pause_main_webview_watchdog(&window) {
                consecutive_failures = 0;
                continue;
            }

            if ping_main_webview(&window, MAIN_WEBVIEW_WATCHDOG_RELOAD_CONFIRM_TIMEOUT) {
                eprintln!("[zinuto] main webview heartbeat recovered during reload confirmation");
                consecutive_failures = 0;
                continue;
            }

            if let Some(native_state) = read_main_webview_native_state(&window) {
                eprintln!(
                    "[zinuto] main webview heartbeat exceeded threshold (loading={}, progress={:.2}), reloading webview",
                    native_state.is_loading,
                    native_state.estimated_progress
                );
            } else {
                eprintln!("[zinuto] main webview heartbeat exceeded threshold, reloading webview");
            }
            last_reload_at = Some(Instant::now());
            consecutive_failures = 0;
            if let Err(reload_error) = window.reload() {
                eprintln!(
                    "[zinuto] failed to reload main webview after heartbeat error: {}",
                    reload_error
                );
            }
        }
    });
}

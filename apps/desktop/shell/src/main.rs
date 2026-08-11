#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// SPDX-License-Identifier: GPL-3.0-only

mod app;
mod bridge;
mod platform;
mod runtime;

pub(crate) const DESKTOP_PRODUCT_NAME: &str = "Zinuto Core";

use crate::app::drag_drop::DragDropManager;
use crate::bridge::transport;
use crate::bridge::{
    ai_conversion_guide, csv_folder_staging, market_data_acquisition_output, BridgeCommandError,
};
use crate::runtime::backend_runtime;
use std::time::Duration;
use tauri::menu::MenuBuilder;
use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};
use tauri::webview::PageLoadEvent;
#[cfg(target_os = "macos")]
use tauri::ActivationPolicy;
use tauri::{Listener, Manager};
#[cfg(windows)]
use tauri::{LogicalSize, Size};

const MAIN_WINDOW_LABEL: &str = "main";
const MAIN_WINDOW_DISPLAY_FALLBACK_DELAYS_MS: &[u64] = &[3_000];
const TRAY_ICON_ID: &str = "zinuto-main-tray";
const TRAY_MENU_OPEN_ID: &str = "zinuto-tray-open";
const TRAY_MENU_QUIT_ID: &str = "zinuto-tray-quit";
#[cfg(target_os = "macos")]
const MACOS_STATUS_BAR_ICON_BYTES: &[u8] = include_bytes!("../icons/status-bar-template.png");
#[tauri::command(rename_all = "camelCase")]
async fn stage_csv_folder_for_import(
    app: tauri::AppHandle,
    folder_path: String,
    source_folder_bookmark_id: Option<String>,
    stage_mode: Option<csv_folder_staging::CsvFolderStageMode>,
    relative_paths: Option<Vec<String>>,
    progress_request_id: Option<String>,
    cancellation_request_id: Option<String>,
) -> Result<csv_folder_staging::CsvFolderStagingResult, BridgeCommandError> {
    csv_folder_staging::stage_csv_folder_for_import(
        app,
        folder_path,
        source_folder_bookmark_id,
        stage_mode,
        relative_paths,
        progress_request_id,
        cancellation_request_id,
    )
    .await
}

#[tauri::command(rename_all = "camelCase")]
fn cancel_csv_folder_staging(cancellation_request_id: String) -> Result<(), BridgeCommandError> {
    csv_folder_staging::cancel_csv_folder_staging(cancellation_request_id)
}

#[tauri::command(rename_all = "camelCase")]
async fn discard_csv_folder_staging(staged_folder_path: String) -> Result<(), BridgeCommandError> {
    csv_folder_staging::discard_csv_folder_staging(staged_folder_path).await
}

#[tauri::command(rename_all = "camelCase")]
async fn authorize_market_data_acquisition_folder(
    app: tauri::AppHandle,
    folder_path: String,
    existing_grant_id: Option<String>,
) -> Result<
    market_data_acquisition_output::MarketDataAcquisitionFolderAuthorization,
    BridgeCommandError,
> {
    market_data_acquisition_output::authorize_market_data_acquisition_folder(
        app,
        folder_path,
        existing_grant_id,
    )
    .await
}

#[tauri::command(rename_all = "camelCase")]
async fn commit_market_data_acquisition_output(
    app: tauri::AppHandle,
    grant_id: String,
    job_id: String,
    manifest_sha256: String,
) -> Result<market_data_acquisition_output::MarketDataAcquisitionCommitResult, BridgeCommandError> {
    market_data_acquisition_output::commit_market_data_acquisition_output(
        app,
        grant_id,
        job_id,
        manifest_sha256,
    )
    .await
}

#[tauri::command(rename_all = "camelCase")]
fn backend_startup_preflight_status(
    app: tauri::AppHandle,
) -> backend_runtime::BackendStartupPreflightStatus {
    backend_runtime::backend_startup_preflight_status(&app)
}

#[tauri::command(rename_all = "camelCase")]
fn desktop_release_channel() -> &'static str {
    backend_runtime::desktop_release_channel()
}

#[tauri::command(rename_all = "camelCase")]
fn desktop_app_quit(app: tauri::AppHandle) {
    // Run shutdown off the IPC responder so the command returns immediately;
    // the process exit is scheduled on the main thread after shutdown.
    let shutdown_app = app.clone();
    let exit_app = app.clone();
    std::thread::spawn(move || {
        shutdown_desktop_runtime(&shutdown_app);
        let exit_main_app = exit_app.clone();
        let _ = exit_app.run_on_main_thread(move || {
            exit_main_app.exit(0);
        });
    });
}

#[tauri::command(rename_all = "camelCase")]
fn desktop_app_restart(app: tauri::AppHandle) {
    // Same async pattern as desktop_app_quit: shutdown must not block the
    // command response, and request_restart runs on the main thread.
    let shutdown_app = app.clone();
    let restart_app = app.clone();
    std::thread::spawn(move || {
        shutdown_desktop_runtime(&shutdown_app);
        let restart_main_app = restart_app.clone();
        let _ = restart_app.run_on_main_thread(move || {
            restart_main_app.request_restart();
        });
    });
}

#[tauri::command(rename_all = "camelCase")]
async fn save_custom_indicator_ai_conversion_guide(
    window: tauri::WebviewWindow,
    language: String,
    content: String,
) -> Result<&'static str, BridgeCommandError> {
    ai_conversion_guide::save_custom_indicator_ai_conversion_guide(window, language, content)
}

#[tauri::command(rename_all = "camelCase")]
fn main_window_ready_to_show(app: tauri::AppHandle) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return;
    };
    if matches!(window.is_visible().ok(), Some(true)) {
        return;
    }
    restore_existing_main_window(&app, &window);
}

#[cfg(windows)]
fn fit_main_window_to_current_monitor(window: &tauri::WebviewWindow) {
    let monitor = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten());
    let Some(monitor) = monitor else {
        return;
    };
    let work_area = monitor.work_area();
    let scale_factor = if monitor.scale_factor().is_finite() && monitor.scale_factor() > 0.0 {
        monitor.scale_factor()
    } else {
        1.0
    };
    let max_width = (work_area.size.width as f64 / scale_factor * 0.92).floor();
    let max_height = (work_area.size.height as f64 / scale_factor * 0.92).floor();
    if !(max_width >= 960.0 && max_height >= 640.0) {
        return;
    }

    let Ok(current_size) = window.inner_size() else {
        return;
    };
    let current_width = current_size.width as f64 / scale_factor;
    let current_height = current_size.height as f64 / scale_factor;
    let next_width = current_width.min(max_width).max(960.0);
    let next_height = current_height.min(max_height).max(640.0);
    if (next_width - current_width).abs() < 1.0 && (next_height - current_height).abs() < 1.0 {
        return;
    }

    let _ = window.set_size(Size::Logical(LogicalSize {
        width: next_width,
        height: next_height,
    }));
    let _ = window.center();
}

#[cfg(target_os = "macos")]
fn prepare_app_for_main_window_display(app: &tauri::AppHandle) {
    let _ = app.set_activation_policy(ActivationPolicy::Regular);
    let _ = app.show();
}

#[cfg(not(target_os = "macos"))]
fn prepare_app_for_main_window_display(_app: &tauri::AppHandle) {}

fn restore_existing_main_window(app: &tauri::AppHandle, window: &tauri::WebviewWindow) {
    prepare_app_for_main_window_display(app);
    prepare_main_window_for_display(window);
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
}

fn restore_main_window(app: &tauri::AppHandle) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        eprintln!("[zinuto] main window restore skipped: missing main window");
        return;
    };
    restore_existing_main_window(app, &window);
}

fn should_restore_main_window_for_display_fallback(is_visible: Option<bool>) -> bool {
    !matches!(is_visible, Some(true))
}

fn restore_main_window_if_display_fallback_needed(app: &tauri::AppHandle) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return;
    };
    if !should_restore_main_window_for_display_fallback(window.is_visible().ok()) {
        return;
    }
    restore_main_window(app);
}

fn prepare_main_window_for_display(window: &tauri::WebviewWindow) {
    let _ = window.set_title(DESKTOP_PRODUCT_NAME);
    #[cfg(windows)]
    fit_main_window_to_current_monitor(window);
}

fn schedule_main_window_display_fallback(app: &tauri::AppHandle) {
    let app_handle = app.clone();
    for delay_ms in MAIN_WINDOW_DISPLAY_FALLBACK_DELAYS_MS {
        let app_for_thread = app_handle.clone();
        let delay_ms = *delay_ms;
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(delay_ms));
            if backend_runtime::backend_shutdown_requested(&app_for_thread) {
                return;
            }
            let app_for_main_thread = app_for_thread.clone();
            let _ = app_for_thread.run_on_main_thread(move || {
                if backend_runtime::backend_shutdown_requested(&app_for_main_thread) {
                    return;
                }
                restore_main_window_if_display_fallback_needed(&app_for_main_thread);
            });
        });
    }
}

fn handle_main_webview_page_load(webview: &tauri::Webview, event: PageLoadEvent) {
    if webview.label() != MAIN_WINDOW_LABEL {
        return;
    }
    if matches!(event, PageLoadEvent::Finished) {
        let _ = webview.window().set_title(DESKTOP_PRODUCT_NAME);
        if let Some(window) = webview.app_handle().get_webview_window(MAIN_WINDOW_LABEL) {
            if should_restore_main_window_for_display_fallback(window.is_visible().ok()) {
                // index.html owns a dependency-free preboot surface, so a finished
                // document is safe to reveal even while React and locale chunks load.
                restore_existing_main_window(webview.app_handle(), &window);
            }
        }
    }
}

fn shutdown_desktop_runtime(app: &tauri::AppHandle) {
    backend_runtime::mark_backend_shutdown_requested(app);
    transport::shutdown_backend_http_transport(app);
    backend_runtime::terminate_tracked_backend_on_exit(app);
}

#[cfg(target_os = "macos")]
fn load_macos_status_bar_icon() -> tauri::Result<tauri::image::Image<'static>> {
    tauri::image::Image::from_bytes(MACOS_STATUS_BAR_ICON_BYTES)
}

fn build_desktop_tray_menu(
    app: &tauri::AppHandle,
    language: platform::desktop_ui_language::DesktopUiLanguage,
) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    let copy = platform::desktop_ui_language::DesktopChromeCopy::for_language(language);
    let open_title = platform::desktop_ui_language::DesktopChromeCopy::with_product(
        copy.tray_open_template,
        DESKTOP_PRODUCT_NAME,
    );
    let quit_title = platform::desktop_ui_language::DesktopChromeCopy::with_product(
        copy.quit_template,
        DESKTOP_PRODUCT_NAME,
    );
    MenuBuilder::new(app)
        .text(TRAY_MENU_OPEN_ID, open_title)
        .separator()
        .text(TRAY_MENU_QUIT_ID, quit_title)
        .build()
}

fn setup_desktop_tray(app: &tauri::App) -> tauri::Result<()> {
    let menu = build_desktop_tray_menu(
        app.handle(),
        platform::desktop_ui_language::DesktopUiLanguage::En,
    )?;

    let mut tray = TrayIconBuilder::with_id(TRAY_ICON_ID)
        .menu(&menu)
        .tooltip(DESKTOP_PRODUCT_NAME)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| match event {
            TrayIconEvent::Click {
                button: MouseButton::Left,
                ..
            }
            | TrayIconEvent::DoubleClick {
                button: MouseButton::Left,
                ..
            } => restore_main_window(tray.app_handle()),
            _ => {}
        })
        .on_menu_event(|app, event| match event.id().as_ref() {
            TRAY_MENU_OPEN_ID => restore_main_window(app),
            TRAY_MENU_QUIT_ID => {
                shutdown_desktop_runtime(app);
                app.exit(0);
            }
            _ => {}
        });

    #[cfg(target_os = "macos")]
    {
        match load_macos_status_bar_icon() {
            Ok(icon) => {
                tray = tray.icon(icon).icon_as_template(true);
            }
            Err(error) => {
                eprintln!(
                    "[zinuto] macOS status bar icon unavailable; falling back to default app icon: {}",
                    error
                );
                if let Some(icon) = app.default_window_icon().cloned() {
                    tray = tray.icon(icon);
                }
            }
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        if let Some(icon) = app.default_window_icon().cloned() {
            tray = tray.icon(icon);
        }
    }
    tray.build(app)?;
    Ok(())
}

fn apply_desktop_ui_language(
    app: &tauri::AppHandle,
    language: platform::desktop_ui_language::DesktopUiLanguage,
) {
    #[cfg(target_os = "macos")]
    match platform::native_menu::build_desktop_menu_for_language(app, language) {
        Ok(menu) => {
            if let Err(error) = app.set_menu(menu) {
                eprintln!("[zinuto] failed to update the desktop menu language: {error}");
            }
        }
        Err(error) => {
            eprintln!("[zinuto] failed to build the localized desktop menu: {error}");
        }
    }

    let Some(tray) = app.tray_by_id(TRAY_ICON_ID) else {
        return;
    };
    match build_desktop_tray_menu(app, language) {
        Ok(menu) => {
            if let Err(error) = tray.set_menu(Some(menu)) {
                eprintln!("[zinuto] failed to update the tray menu language: {error}");
            }
        }
        Err(error) => {
            eprintln!("[zinuto] failed to build the localized tray menu: {error}");
        }
    }
}

fn setup_desktop_ui_language_listener(app: &tauri::App) {
    let app_handle = app.handle().clone();
    app.listen(
        platform::desktop_ui_language::DESKTOP_UI_LANGUAGE_EVENT,
        move |event| {
            let Some(language) =
                platform::desktop_ui_language::DesktopUiLanguage::from_event_payload(
                    event.payload(),
                )
            else {
                return;
            };
            let update_handle = app_handle.clone();
            if let Err(error) = app_handle.run_on_main_thread(move || {
                apply_desktop_ui_language(&update_handle, language);
            }) {
                eprintln!("[zinuto] failed to schedule the desktop menu language update: {error}");
            }
        },
    );
}

fn main() {
    let builder = tauri::Builder::default();
    #[cfg(target_os = "macos")]
    let builder = builder
        .menu(platform::native_menu::build_desktop_menu)
        .on_menu_event(platform::native_menu::handle_desktop_menu_event);
    let builder = builder
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            restore_main_window(app);
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init());

    let builder = builder.invoke_handler(tauri::generate_handler![
        stage_csv_folder_for_import,
        cancel_csv_folder_staging,
        discard_csv_folder_staging,
        authorize_market_data_acquisition_folder,
        commit_market_data_acquisition_output,
        backend_startup_preflight_status,
        desktop_release_channel,
        desktop_app_quit,
        desktop_app_restart,
        save_custom_indicator_ai_conversion_guide,
        main_window_ready_to_show,
        bridge::backend_http_request
    ]);

    let app = builder
        .on_page_load(|webview, payload| {
            handle_main_webview_page_load(webview, payload.event());
        })
        .setup(|app| {
            backend_runtime::initialize_backend_runtime_state(app);
            transport::initialize_backend_http_registry(app);
            setup_desktop_tray(app)?;
            setup_desktop_ui_language_listener(app);
            // Sweep crashed-run leftovers (stale CSV staging directories and
            // market-data acquisition residue) off the startup critical path.
            {
                let sweep_app_handle = app.handle().clone();
                tauri::async_runtime::spawn_blocking(move || {
                    csv_folder_staging::sweep_stale_csv_staging_directories();
                    market_data_acquisition_output::sweep_stale_acquisition_residue(
                        &sweep_app_handle,
                    );
                });
            }
            if let Some(transport) = backend_runtime::resolve_backend_transport(app.handle()) {
                let startup_app_handle = app.handle().clone();
                let terminal_app_handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    let startup_result = tauri::async_runtime::spawn_blocking(move || {
                        backend_runtime::ensure_backend_ready(&startup_app_handle, &transport)
                    })
                    .await;
                    match startup_result {
                        Ok(Ok(_)) => {}
                        Ok(Err(error)) => {
                            eprintln!("[zinuto] backend startup preflight failed: {}", error);
                            backend_runtime::record_backend_startup_preflight_failed_if_pending(
                                &terminal_app_handle,
                                "startup",
                                "BACKEND_STARTUP_PREFLIGHT_FAILED",
                                "Backend startup preflight did not complete",
                            );
                        }
                        Err(error) => {
                            eprintln!("[zinuto] backend startup preflight task failed: {}", error);
                            backend_runtime::record_backend_startup_preflight_failed_if_pending(
                                &terminal_app_handle,
                                "startupTask",
                                "BACKEND_STARTUP_TASK_FAILED",
                                "Backend startup task did not complete",
                            );
                        }
                    }
                });
            } else {
                backend_runtime::record_backend_startup_preflight_failed(
                    app.handle(),
                    "transport",
                    "BACKEND_TRANSPORT_UNAVAILABLE",
                    "Backend transport could not be resolved",
                );
            }
            if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
                prepare_main_window_for_display(&window);
                schedule_main_window_display_fallback(app.handle());
            } else {
                eprintln!("[zinuto] startup display skipped: missing main window");
            }
            #[cfg(target_os = "macos")]
            runtime::watchdog::spawn_main_webview_watchdog(app.handle());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building desktop application");

    let mut drag_drop_manager = DragDropManager::new();

    app.run(move |app, event| match event {
        tauri::RunEvent::WindowEvent {
            label,
            event: tauri::WindowEvent::DragDrop(drag_event),
            ..
        } => {
            drag_drop_manager.handle_event(app, label.clone(), drag_event);
        }
        tauri::RunEvent::WindowEvent {
            label,
            event: tauri::WindowEvent::CloseRequested { api, .. },
            ..
        } if label == MAIN_WINDOW_LABEL => {
            api.prevent_close();
        }
        #[cfg(target_os = "macos")]
        tauri::RunEvent::Reopen { .. } => {
            restore_main_window(app);
        }
        tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit => {
            shutdown_desktop_runtime(app);
        }
        _ => {}
    });
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::platform;
    use std::path::Path;

    #[test]
    fn shared_macos_data_dir_uses_container_path_from_real_home() {
        let home_dir = Path::new("test-home");
        let expected = home_dir
            .join(platform::shared_macos_container_home_suffix())
            .join(platform::shared_macos_app_data_suffix());

        assert_eq!(
            platform::resolve_shared_macos_desktop_data_dir_from_home(home_dir),
            expected
        );
    }

    #[test]
    fn shared_macos_data_dir_does_not_duplicate_container_segments_inside_sandbox_home() {
        let sandbox_home =
            Path::new("test-home").join(platform::shared_macos_container_home_suffix());
        let expected = sandbox_home.join(platform::shared_macos_app_data_suffix());

        assert_eq!(
            platform::resolve_shared_macos_desktop_data_dir_from_home(sandbox_home.as_path()),
            expected
        );
    }

    #[test]
    fn macos_app_bundle_path_resolves_from_executable_path() {
        let executable_path =
            Path::new("Applications/Zinuto Core.app/Contents/MacOS/open-trading-practice");

        assert_eq!(
            platform::resolve_macos_app_bundle_path_from_executable(executable_path),
            Some(Path::new("Applications/Zinuto Core.app").to_path_buf())
        );
    }

    #[test]
    fn macos_app_bundle_path_rejects_non_bundle_executable_paths() {
        let executable_path = Path::new("bin/open-trading-practice");

        assert_eq!(
            platform::resolve_macos_app_bundle_path_from_executable(executable_path),
            None
        );
    }
}

#[cfg(test)]
mod main_window_viewport_tests {
    use super::should_restore_main_window_for_display_fallback;

    #[test]
    fn main_window_display_fallback_does_not_restore_visible_window() {
        assert!(!should_restore_main_window_for_display_fallback(Some(true)));
        assert!(should_restore_main_window_for_display_fallback(Some(false)));
        assert!(should_restore_main_window_for_display_fallback(None));
    }
}

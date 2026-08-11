// SPDX-License-Identifier: GPL-3.0-only

use tauri::image::Image;
use tauri::menu::{
    AboutMetadataBuilder, Menu, MenuBuilder, MenuItem, MenuItemBuilder, PredefinedMenuItem,
    SubmenuBuilder,
};
use tauri::{AppHandle, Emitter, Runtime};

use super::desktop_ui_language::{DesktopChromeCopy, DesktopUiLanguage};
use crate::DESKTOP_PRODUCT_NAME;

const ABOUT_ICON_BYTES: &[u8] = include_bytes!("../../icons/about-community-rounded-rect.png");

const DESKTOP_MENU_COMMAND_EVENT: &str = "zinuto://desktop-menu-command";

const MENU_SETTINGS: &str = "zinuto.menu.settings";
const MENU_NEW_FREE_REPLAY: &str = "zinuto.menu.new-free-replay";
const MENU_IMPORT_MARKET_DATA: &str = "zinuto.menu.import-market-data";
const MENU_COMMAND_CENTER: &str = "zinuto.menu.command-center";
const MENU_FREE_REPLAY: &str = "zinuto.menu.free-replay";
const MENU_DATA: &str = "zinuto.menu.data";
const MENU_VIEW_SETTINGS: &str = "zinuto.menu.view-settings";
const MENU_KEYBOARD_SHORTCUTS: &str = "zinuto.menu.keyboard-shortcuts";

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopMenuCommandPayload {
    command: &'static str,
}

fn menu_item<R: Runtime>(
    app: &AppHandle<R>,
    id: &'static str,
    text: &str,
    accelerator: Option<&'static str>,
) -> tauri::Result<MenuItem<R>> {
    let mut builder = MenuItemBuilder::with_id(id, text);
    if let Some(value) = accelerator {
        builder = builder.accelerator(value);
    }
    builder.build(app)
}

pub fn build_desktop_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    build_desktop_menu_for_language(app, DesktopUiLanguage::En)
}

pub(crate) fn build_desktop_menu_for_language<R: Runtime>(
    app: &AppHandle<R>,
    language: DesktopUiLanguage,
) -> tauri::Result<Menu<R>> {
    let copy = DesktopChromeCopy::for_language(language);
    let about_icon = Image::from_bytes(ABOUT_ICON_BYTES)?;
    let about_metadata = AboutMetadataBuilder::new()
        .name(Some(DESKTOP_PRODUCT_NAME))
        .version(Some(app.package_info().version.to_string()))
        .copyright(Some(
            "\u{00A9} Qingchuang Juejin (Qingdao) Information Technology Co., Ltd.",
        ))
        .icon(Some(about_icon))
        .build();
    let about_title = DesktopChromeCopy::with_product(copy.about_template, DESKTOP_PRODUCT_NAME);
    let about = PredefinedMenuItem::about(app, Some(&about_title), Some(about_metadata))?;
    let settings = menu_item(app, MENU_SETTINGS, copy.settings, Some("CmdOrCtrl+Comma"))?;
    let new_free_replay = menu_item(
        app,
        MENU_NEW_FREE_REPLAY,
        copy.new_free_replay,
        Some("CmdOrCtrl+KeyN"),
    )?;
    let import_market_data = menu_item(
        app,
        MENU_IMPORT_MARKET_DATA,
        copy.import_market_data,
        Some("CmdOrCtrl+KeyI"),
    )?;
    let command_center = menu_item(
        app,
        MENU_COMMAND_CENTER,
        copy.training_center,
        Some("CmdOrCtrl+Digit1"),
    )?;
    let free_replay = menu_item(
        app,
        MENU_FREE_REPLAY,
        copy.free_replay,
        Some("CmdOrCtrl+Digit2"),
    )?;
    let data = menu_item(
        app,
        MENU_DATA,
        copy.data_management,
        Some("CmdOrCtrl+Digit3"),
    )?;
    let view_settings = menu_item(
        app,
        MENU_VIEW_SETTINGS,
        copy.settings.trim_end_matches('…'),
        Some("CmdOrCtrl+Digit4"),
    )?;
    let keyboard_shortcuts = menu_item(
        app,
        MENU_KEYBOARD_SHORTCUTS,
        copy.keyboard_shortcuts,
        Some("CmdOrCtrl+Slash"),
    )?;

    let mut app_menu = SubmenuBuilder::new(app, DESKTOP_PRODUCT_NAME)
        .item(&about)
        .item(&settings)
        .separator();
    #[cfg(target_os = "macos")]
    {
        app_menu = app_menu
            .services_with_text(copy.services)
            .separator()
            .hide_with_text(DesktopChromeCopy::with_product(
                copy.hide_template,
                DESKTOP_PRODUCT_NAME,
            ))
            .hide_others_with_text(copy.hide_others)
            .separator();
    }
    let quit_title = DesktopChromeCopy::with_product(copy.quit_template, DESKTOP_PRODUCT_NAME);
    app_menu = app_menu.quit_with_text(&quit_title);
    let app_menu = app_menu.build()?;

    let file_menu = SubmenuBuilder::new(app, copy.file)
        .item(&new_free_replay)
        .item(&import_market_data)
        .build()?;
    let edit_menu = SubmenuBuilder::new(app, copy.edit)
        .undo_with_text(copy.undo)
        .redo_with_text(copy.redo)
        .separator()
        .cut_with_text(copy.cut)
        .copy_with_text(copy.copy)
        .paste_with_text(copy.paste)
        .select_all_with_text(copy.select_all)
        .build()?;
    let view_menu = SubmenuBuilder::new(app, copy.view)
        .item(&command_center)
        .item(&free_replay)
        .item(&data)
        .item(&view_settings)
        .build()?;
    let window_menu = SubmenuBuilder::new(app, copy.window)
        .minimize_with_text(copy.minimize)
        .maximize_with_text(copy.maximize)
        .separator()
        .close_window_with_text(copy.close_window)
        .build()?;
    let help_menu = SubmenuBuilder::new(app, copy.help)
        .item(&keyboard_shortcuts)
        .build()?;

    MenuBuilder::new(app)
        .item(&app_menu)
        .item(&file_menu)
        .item(&edit_menu)
        .item(&view_menu)
        .item(&window_menu)
        .item(&help_menu)
        .build()
}

pub fn handle_desktop_menu_event<R: Runtime>(app: &AppHandle<R>, event: tauri::menu::MenuEvent) {
    let command = match event.id().as_ref() {
        MENU_SETTINGS | MENU_VIEW_SETTINGS => "OPEN_SETTINGS",
        MENU_NEW_FREE_REPLAY => "NEW_FREE_REPLAY",
        MENU_IMPORT_MARKET_DATA => "OPEN_MARKET_DATA_IMPORT",
        MENU_COMMAND_CENTER => "OPEN_COMMAND_CENTER",
        MENU_FREE_REPLAY => "OPEN_FREE_REPLAY",
        MENU_DATA => "OPEN_DATA",
        MENU_KEYBOARD_SHORTCUTS => "OPEN_KEYBOARD_SHORTCUTS",
        _ => return,
    };

    if let Err(error) = app.emit(
        DESKTOP_MENU_COMMAND_EVENT,
        DesktopMenuCommandPayload { command },
    ) {
        eprintln!("[zinuto] failed to emit desktop menu command: {}", error);
    }
}

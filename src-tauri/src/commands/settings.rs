use tauri::State;

use crate::db::Database;
use crate::error::AppError;
use crate::models::{AppSettings, NotificationDisplayMethod, ServerConfig, ThemeMode};
use crate::services::ConnectionManager;

#[tauri::command]
#[specta::specta]
pub fn get_settings(db: State<'_, Database>) -> Result<AppSettings, AppError> {
    db.get_settings()
}

#[tauri::command]
#[specta::specta]
pub fn set_theme(db: State<'_, Database>, theme: ThemeMode) -> Result<(), AppError> {
    let theme_str = match theme {
        ThemeMode::Light => "light",
        ThemeMode::Dark => "dark",
        ThemeMode::System => "system",
    };
    db.set_setting("theme", theme_str)
}

#[tauri::command]
#[specta::specta]
pub fn add_server(db: State<'_, Database>, server: ServerConfig) -> Result<(), AppError> {
    db.add_server(server)
}

#[tauri::command]
#[specta::specta]
pub async fn remove_server(
    db: State<'_, Database>,
    conn_manager: State<'_, ConnectionManager>,
    url: String,
) -> Result<(), AppError> {
    conn_manager.disconnect_server(&url).await;
    db.remove_server(&url)
}

#[tauri::command]
#[specta::specta]
pub fn set_default_server(db: State<'_, Database>, url: String) -> Result<(), AppError> {
    db.set_default_server(&url)
}

#[tauri::command]
#[specta::specta]
pub fn set_minimize_to_tray(db: State<'_, Database>, enabled: bool) -> Result<(), AppError> {
    db.set_setting("minimize_to_tray", if enabled { "true" } else { "false" })
}

#[tauri::command]
#[specta::specta]
pub fn set_start_minimized(db: State<'_, Database>, enabled: bool) -> Result<(), AppError> {
    db.set_setting("start_minimized", if enabled { "true" } else { "false" })
}

#[tauri::command]
#[specta::specta]
pub fn set_notification_method(
    db: State<'_, Database>,
    method: NotificationDisplayMethod,
) -> Result<(), AppError> {
    let method_str = match method {
        NotificationDisplayMethod::Native => "native",
        NotificationDisplayMethod::WindowsEnhanced => "windows_enhanced",
    };
    db.set_setting("notification_method", method_str)
}

#[tauri::command]
#[specta::specta]
pub fn set_notification_force_display(
    db: State<'_, Database>,
    enabled: bool,
) -> Result<(), AppError> {
    db.set_setting(
        "notification_force_display",
        if enabled { "true" } else { "false" },
    )
}

#[tauri::command]
#[specta::specta]
pub fn set_notification_show_actions(
    db: State<'_, Database>,
    enabled: bool,
) -> Result<(), AppError> {
    db.set_setting(
        "notification_show_actions",
        if enabled { "true" } else { "false" },
    )
}

#[tauri::command]
#[specta::specta]
pub fn set_notification_show_images(
    db: State<'_, Database>,
    enabled: bool,
) -> Result<(), AppError> {
    db.set_setting(
        "notification_show_images",
        if enabled { "true" } else { "false" },
    )
}

#[tauri::command]
#[specta::specta]
pub fn set_notification_sound(db: State<'_, Database>, enabled: bool) -> Result<(), AppError> {
    db.set_setting("notification_sound", if enabled { "true" } else { "false" })
}

#[tauri::command]
#[specta::specta]
pub fn set_compact_view(db: State<'_, Database>, enabled: bool) -> Result<(), AppError> {
    db.set_setting("compact_view", if enabled { "true" } else { "false" })
}

#[tauri::command]
#[specta::specta]
pub fn set_expand_new_messages(db: State<'_, Database>, enabled: bool) -> Result<(), AppError> {
    db.set_setting(
        "expand_new_messages",
        if enabled { "true" } else { "false" },
    )
}

#[tauri::command]
#[specta::specta]
pub fn set_delete_local_only(db: State<'_, Database>, enabled: bool) -> Result<(), AppError> {
    db.set_setting("delete_local_only", if enabled { "true" } else { "false" })
}

#[tauri::command]
#[specta::specta]
pub fn set_favorites_enabled(db: State<'_, Database>, enabled: bool) -> Result<(), AppError> {
    db.set_setting("favorites_enabled", if enabled { "true" } else { "false" })
}

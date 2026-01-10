use tauri::State;

use crate::db::Database;
use crate::error::AppError;
use crate::models::{AppSettings, ServerConfig};
use crate::services::ConnectionManager;

#[tauri::command]
#[specta::specta]
pub fn get_settings(db: State<'_, Database>) -> Result<AppSettings, AppError> {
    db.get_settings()
}

#[tauri::command]
#[specta::specta]
pub fn set_theme(db: State<'_, Database>, theme: String) -> Result<(), AppError> {
    db.set_setting("theme", &theme)
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

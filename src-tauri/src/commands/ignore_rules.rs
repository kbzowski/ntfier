use tauri::State;

use crate::db::Database;
use crate::error::AppError;
use crate::models::IgnoreRule;

#[tauri::command]
#[specta::specta]
pub fn get_ignore_rules(db: State<'_, Database>) -> Result<Vec<IgnoreRule>, AppError> {
    db.get_ignore_rules()
}

#[tauri::command]
#[specta::specta]
pub fn add_ignore_rule(
    db: State<'_, Database>,
    pattern: String,
    subscription_id: Option<String>,
) -> Result<IgnoreRule, AppError> {
    db.add_ignore_rule(&pattern, subscription_id.as_deref())
}

#[tauri::command]
#[specta::specta]
pub fn delete_ignore_rule(db: State<'_, Database>, id: String) -> Result<(), AppError> {
    db.delete_ignore_rule(&id)
}

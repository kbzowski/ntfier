use tauri::State;

use crate::db::Database;
use crate::error::AppError;
use crate::models::{CreateSubscription, Subscription};
use crate::services::ConnectionManager;

#[tauri::command]
#[specta::specta]
pub fn get_subscriptions(db: State<'_, Database>) -> Result<Vec<Subscription>, AppError> {
    db.get_all_subscriptions()
}

#[tauri::command]
#[specta::specta]
pub async fn add_subscription(
    db: State<'_, Database>,
    conn_manager: State<'_, ConnectionManager>,
    subscription: CreateSubscription,
) -> Result<Subscription, AppError> {
    let sub = db.create_subscription(subscription)?;
    conn_manager.connect(&sub).await?;
    Ok(sub)
}

#[tauri::command]
#[specta::specta]
pub async fn remove_subscription(
    db: State<'_, Database>,
    conn_manager: State<'_, ConnectionManager>,
    id: String,
) -> Result<(), AppError> {
    conn_manager.disconnect(&id).await;
    db.delete_subscription(&id)
}

#[tauri::command]
#[specta::specta]
pub fn toggle_mute(db: State<'_, Database>, id: String) -> Result<Subscription, AppError> {
    db.toggle_subscription_mute(&id)
}

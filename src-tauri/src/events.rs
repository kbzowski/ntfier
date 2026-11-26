//! Every event sent between Rust and the windows, typed for both sides.
//!
//! Emitting an event missing from [`all`] panics, and the UI can only listen to
//! events listed there, so a new event goes into [`all`] next to its struct.

use serde::Serialize;
use specta::Type;
use tauri_specta::Event;

use crate::models::{Notification, ServerStatusEntry, SubscriptionError};
use crate::services::UpdateInfo;

#[derive(Clone, Serialize, Type, Event)]
#[tauri_specta(event_name = "settings:changed")]
pub struct SettingsChanged;

#[derive(Clone, Serialize, Type, Event)]
#[tauri_specta(event_name = "settings:ignore-rules-changed")]
pub struct IgnoreRulesChanged;

#[derive(Clone, Serialize, Type, Event)]
#[tauri_specta(event_name = "settings:server-removed")]
pub struct ServerRemoved {
    pub url: String,
}

/// Sent only to the settings window: open this server's form.
#[derive(Clone, Serialize, Type, Event)]
#[tauri_specta(event_name = "settings:edit-server")]
pub struct EditServer(pub String);

/// Emitted by the window where the theme was changed; Rust only types it.
#[derive(Clone, Serialize, Type, Event)]
#[serde(rename_all = "camelCase")]
#[tauri_specta(event_name = "settings:theme-changed")]
pub struct ThemeChanged {
    pub theme_id: String,
    pub is_system_mode: bool,
}

#[derive(Clone, Serialize, Type, Event)]
#[tauri_specta(event_name = "notification:new")]
pub struct NewNotification(pub Notification);

#[derive(Clone, Serialize, Type, Event)]
#[tauri_specta(event_name = "notifications:retention-applied")]
pub struct RetentionApplied;

/// Carries the subscription id whose stored messages changed in place.
#[derive(Clone, Serialize, Type, Event)]
#[tauri_specta(event_name = "subscription:changed")]
pub struct SubscriptionChanged(pub String);

#[derive(Clone, Serialize, Type, Event)]
#[tauri_specta(event_name = "subscription:error")]
pub struct SubscriptionErrorChanged(pub SubscriptionError);

#[derive(Clone, Serialize, Type, Event)]
#[tauri_specta(event_name = "subscriptions:synced")]
pub struct SubscriptionsSynced;

#[derive(Clone, Serialize, Type, Event)]
#[tauri_specta(event_name = "server:status")]
pub struct ServerStatusChanged(pub ServerStatusEntry);

#[derive(Clone, Serialize, Type, Event)]
#[tauri_specta(event_name = "update:available")]
pub struct UpdateAvailable(pub UpdateInfo);

#[derive(Clone, Serialize, Type, Event)]
#[tauri_specta(event_name = "window:shown")]
pub struct WindowShown;

pub fn all() -> tauri_specta::Events {
    tauri_specta::collect_events![
        SettingsChanged,
        IgnoreRulesChanged,
        ServerRemoved,
        EditServer,
        ThemeChanged,
        NewNotification,
        RetentionApplied,
        SubscriptionChanged,
        SubscriptionErrorChanged,
        SubscriptionsSynced,
        ServerStatusChanged,
        UpdateAvailable,
        WindowShown,
    ]
}

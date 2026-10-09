//! Application settings and server configuration.

use serde::{Deserialize, Serialize};
use specta::Type;

/// Theme mode for the application.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum ThemeMode {
    Light,
    Dark,
    #[default]
    System,
}

/// Notification display method.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum NotificationDisplayMethod {
    /// Standard cross-platform notifications (may be suppressed by Focus Assist).
    #[default]
    Native,
    /// Windows-specific enhanced notifications with action buttons and force display.
    WindowsEnhanced,
}

/// Configuration for a single ntfy server.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ServerConfig {
    pub url: String,
    pub username: Option<String>,
    pub password: Option<String>,
    pub is_default: bool,
}

impl ServerConfig {
    /// Returns username and password if both are present and username is non-empty.
    pub fn credentials(&self) -> Option<(&str, &str)> {
        self.username
            .as_ref()
            .filter(|u| !u.is_empty())
            .zip(self.password.as_ref())
            .map(|(u, p)| (u.as_str(), p.as_str()))
    }
}

/// Notification-specific settings.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct NotificationSettings {
    /// Notification display method.
    #[serde(default)]
    pub notification_method: NotificationDisplayMethod,
    /// Force display even when Focus Assist is on (Windows Enhanced only).
    #[serde(default)]
    pub notification_force_display: bool,
    /// Show action buttons in notification (Windows Enhanced only).
    #[serde(default = "default_true")]
    pub notification_show_actions: bool,
    /// Show images in notification (Windows Enhanced only).
    #[serde(default = "default_true")]
    pub notification_show_images: bool,
    /// Play notification sound.
    #[serde(default = "default_true")]
    pub notification_sound: bool,
}

/// Application-wide settings.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    /// Theme mode for the application.
    pub theme: ThemeMode,
    /// Configured ntfy servers.
    pub servers: Vec<ServerConfig>,
    /// URL of the default server for new subscriptions.
    pub default_server: String,
    /// Minimize to tray instead of closing.
    #[serde(default = "default_true")]
    pub minimize_to_tray: bool,
    /// Start application minimized to tray.
    #[serde(default)]
    pub start_minimized: bool,
    /// Notification display method.
    #[serde(default)]
    pub notification_method: NotificationDisplayMethod,
    /// Force display even when Focus Assist is on (Windows Enhanced only).
    #[serde(default)]
    pub notification_force_display: bool,
    /// Show action buttons in notification (Windows Enhanced only).
    #[serde(default = "default_true")]
    pub notification_show_actions: bool,
    /// Show images in notification (Windows Enhanced only).
    #[serde(default = "default_true")]
    pub notification_show_images: bool,
    /// Play notification sound.
    #[serde(default = "default_true")]
    pub notification_sound: bool,
    /// Show messages in collapsed accordion style.
    #[serde(default)]
    pub compact_view: bool,
    /// Automatically expand newly received messages (when compact view is enabled).
    #[serde(default = "default_true")]
    pub expand_new_messages: bool,
    /// Delete notifications only locally (when disabled, also deletes from ntfy server).
    #[serde(default = "default_true")]
    pub delete_local_only: bool,
    /// Enable favorites feature (star icon on notifications).
    #[serde(default)]
    pub favorites_enabled: bool,
}

const fn default_true() -> bool {
    true
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: ThemeMode::System,
            servers: vec![ServerConfig {
                url: "https://ntfy.sh".to_string(),
                username: None,
                password: None,
                is_default: true,
            }],
            default_server: "https://ntfy.sh".to_string(),
            minimize_to_tray: true,
            start_minimized: false,
            notification_method: NotificationDisplayMethod::Native,
            notification_force_display: false,
            notification_show_actions: true,
            notification_show_images: true,
            notification_sound: true,
            compact_view: false,
            expand_new_messages: true,
            delete_local_only: true,
            favorites_enabled: false,
        }
    }
}

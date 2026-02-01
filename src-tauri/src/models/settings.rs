//! Application settings and server configuration.

use serde::{Deserialize, Serialize};
use specta::Type;
use url::Url;

use crate::error::AppError;

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
    /// Validates the server configuration.
    ///
    /// Checks that the URL is valid and uses http or https scheme.
    pub fn validate(&self) -> Result<(), AppError> {
        // Check URL is not empty
        if self.url.trim().is_empty() {
            return Err(AppError::InvalidUrl(
                "Server URL cannot be empty".to_string(),
            ));
        }

        // Parse and validate URL
        let parsed =
            Url::parse(&self.url).map_err(|e| AppError::InvalidUrl(format!("Invalid URL: {e}")))?;

        // Check scheme is http or https
        if !["http", "https"].contains(&parsed.scheme()) {
            return Err(AppError::InvalidUrl(
                "URL must use http or https scheme".to_string(),
            ));
        }

        // Check host is present
        if parsed.host().is_none() {
            return Err(AppError::InvalidUrl("URL must have a host".to_string()));
        }

        Ok(())
    }

    /// Returns the URL without trailing slashes for consistent comparison.
    pub fn normalized_url(&self) -> &str {
        self.url.trim_end_matches('/')
    }

    /// Checks if this server's URL matches another URL (ignoring trailing slashes).
    pub fn url_matches(&self, other: &str) -> bool {
        self.normalized_url() == other.trim_end_matches('/')
    }

    /// Returns username and password if both are present and username is non-empty.
    pub fn credentials(&self) -> Option<(&str, &str)> {
        self.username
            .as_ref()
            .filter(|u| !u.is_empty())
            .zip(self.password.as_ref())
            .map(|(u, p)| (u.as_str(), p.as_str()))
    }
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
        }
    }
}

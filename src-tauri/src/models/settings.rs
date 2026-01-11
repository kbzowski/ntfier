//! Application settings and server configuration.

use serde::{Deserialize, Serialize};
use specta::Type;

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
    /// Theme ID or "system" for automatic.
    pub theme: String,
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
}

fn default_true() -> bool {
    true
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: "system".to_string(),
            servers: vec![ServerConfig {
                url: "https://ntfy.sh".to_string(),
                username: None,
                password: None,
                is_default: true,
            }],
            default_server: "https://ntfy.sh".to_string(),
            minimize_to_tray: true,
            start_minimized: false,
        }
    }
}

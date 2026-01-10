use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ServerConfig {
    pub url: String,
    pub username: Option<String>,
    pub password: Option<String>,
    pub is_default: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub theme: String,
    pub servers: Vec<ServerConfig>,
    pub default_server: String,
    #[serde(default = "default_true")]
    pub minimize_to_tray: bool,
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

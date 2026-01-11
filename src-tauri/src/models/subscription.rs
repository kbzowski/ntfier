//! Subscription data structures.

use serde::{Deserialize, Serialize};
use specta::Type;

use super::server_url::normalize_url;

/// A subscription to a topic on an ntfy server.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Subscription {
    pub id: String,
    pub topic: String,
    pub server_url: String,
    pub display_name: Option<String>,
    pub unread_count: i32,
    /// Timestamp of the most recent notification (milliseconds).
    pub last_notification: Option<i64>,
    /// Whether notifications from this subscription are muted.
    pub muted: bool,
}

impl Subscription {
    /// Returns the server URL without trailing slashes for consistent comparison.
    pub fn normalized_server_url(&self) -> &str {
        normalize_url(&self.server_url)
    }

    /// Checks if this subscription's server URL matches another URL.
    pub fn server_url_matches(&self, other: &str) -> bool {
        self.normalized_server_url() == normalize_url(other)
    }
}

/// Data required to create a new subscription.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CreateSubscription {
    pub topic: String,
    pub server_url: String,
    pub display_name: Option<String>,
}

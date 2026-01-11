//! Subscription data structures.

use serde::{Deserialize, Serialize};
use specta::Type;
use url::Url;

use super::server_url::normalize_url;
use crate::error::AppError;

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

impl CreateSubscription {
    /// Validates the subscription data.
    ///
    /// Checks that the topic is valid and the server URL is properly formatted.
    pub fn validate(&self) -> Result<(), AppError> {
        // Validate topic
        let topic = self.topic.trim();
        if topic.is_empty() {
            return Err(AppError::InvalidUrl("Topic cannot be empty".to_string()));
        }

        // Topic should only contain alphanumeric characters, underscores, and hyphens
        // ntfy allows topics matching pattern: [-_A-Za-z0-9]{1,64}
        if topic.len() > 64 {
            return Err(AppError::InvalidUrl(
                "Topic must be 64 characters or less".to_string(),
            ));
        }

        let valid_topic = topic
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
        if !valid_topic {
            return Err(AppError::InvalidUrl(
                "Topic can only contain letters, numbers, hyphens, and underscores".to_string(),
            ));
        }

        // Validate server URL
        if self.server_url.trim().is_empty() {
            return Err(AppError::InvalidUrl(
                "Server URL cannot be empty".to_string(),
            ));
        }

        let parsed = Url::parse(&self.server_url)
            .map_err(|e| AppError::InvalidUrl(format!("Invalid server URL: {e}")))?;

        if !["http", "https"].contains(&parsed.scheme()) {
            return Err(AppError::InvalidUrl(
                "Server URL must use http or https scheme".to_string(),
            ));
        }

        if parsed.host().is_none() {
            return Err(AppError::InvalidUrl(
                "Server URL must have a host".to_string(),
            ));
        }

        Ok(())
    }
}

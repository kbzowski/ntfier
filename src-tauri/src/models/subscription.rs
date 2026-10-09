//! Subscription data structures.

use super::server_url::canonical_url;
use crate::error::AppError;
use serde::{Deserialize, Serialize};
use specta::Type;

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
    #[specta(type = Option<specta_typescript::Number>)]
    pub last_notification: Option<i64>,
    /// Whether notifications from this subscription are muted.
    pub muted: bool,
}

/// Paths the ntfy server routes itself, so they can't be topics.
const RESERVED_TOPICS: [&str; 10] = [
    "docs", "static", "file", "app", "metrics", "account", "settings", "signup", "login", "v1",
];

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

        if RESERVED_TOPICS.contains(&topic) {
            return Err(AppError::InvalidUrl(format!(
                "\"{topic}\" is reserved by ntfy and can't be used as a topic"
            )));
        }

        canonical_url(&self.server_url)?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sub(topic: &str) -> CreateSubscription {
        CreateSubscription {
            topic: topic.to_string(),
            server_url: "https://ntfy.sh".to_string(),
            display_name: None,
        }
    }

    #[test]
    fn rejects_reserved_topic_names() {
        for name in ["docs", "v1", "file", "account"] {
            assert!(sub(name).validate().is_err(), "{name} must be rejected");
        }
    }

    #[test]
    fn accepts_regular_topic() {
        assert!(sub("alerts").validate().is_ok());
        assert!(sub("docs2").validate().is_ok());
    }
}

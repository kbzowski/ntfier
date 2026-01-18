//! Notification data structures and ntfy message conversion.
//!
//! Defines the internal notification format and provides conversion
//! from ntfy's wire format to the application's internal representation.

use serde::{Deserialize, Serialize};
use serde_repr::{Deserialize_repr, Serialize_repr};
use specta::Type;

/// Notification priority levels matching ntfy's 1-5 scale.
///
/// Serialized as numbers 1-5 via `serde_repr`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize_repr, Deserialize_repr, Type)]
#[repr(u8)]
pub enum Priority {
    Min = 1,
    Low = 2,
    #[default]
    Default = 3,
    High = 4,
    Max = 5,
}

impl From<i8> for Priority {
    fn from(value: i8) -> Self {
        match value {
            1 => Self::Min,
            2 => Self::Low,
            4 => Self::High,
            5 => Self::Max,
            _ => Self::Default,
        }
    }
}

/// A notification stored in the local database.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Notification {
    pub id: String,
    pub topic_id: String,
    pub title: String,
    pub message: String,
    /// Priority level (1-5): 1=min, 2=low, 3=default, 4=high, 5=max.
    #[specta(type = u8)]
    pub priority: Priority,
    pub tags: Vec<String>,
    /// Unix timestamp in milliseconds.
    pub timestamp: i64,
    pub actions: Vec<NotificationAction>,
    pub attachments: Vec<Attachment>,
    pub read: bool,
}

/// An action button attached to a notification.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct NotificationAction {
    pub id: String,
    pub label: String,
    pub url: Option<String>,
    pub method: Option<String>,
    pub clear: bool,
}

/// A file attachment on a notification.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Attachment {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    #[specta(rename = "type")]
    pub attachment_type: String,
    pub url: String,
    pub size: Option<i64>,
}

/// Raw message from ntfy WebSocket or HTTP API.
///
/// This is the wire format used by ntfy servers. Use `into_notification()`
/// to convert to the internal `Notification` format.
#[allow(dead_code)]
#[derive(Debug, Clone, Deserialize)]
pub struct NtfyMessage {
    pub id: String,
    pub time: i64,
    pub event: String,
    pub topic: String,
    pub message: Option<String>,
    pub title: Option<String>,
    pub priority: Option<i8>,
    pub tags: Option<Vec<String>>,
    pub click: Option<String>,
    pub actions: Option<Vec<NtfyAction>>,
    pub attachment: Option<NtfyAttachment>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Deserialize)]
pub struct NtfyAction {
    pub id: String,
    pub action: String,
    pub label: String,
    pub url: Option<String>,
    pub method: Option<String>,
    pub clear: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NtfyAttachment {
    pub name: String,
    #[serde(rename = "type")]
    pub mime_type: Option<String>,
    pub url: String,
    pub size: Option<i64>,
}

// ===== Conversions from ntfy format to internal format =====

impl From<NtfyAction> for NotificationAction {
    fn from(action: NtfyAction) -> Self {
        Self {
            id: action.id,
            label: action.label,
            url: action.url,
            method: action.method,
            clear: action.clear.unwrap_or(false),
        }
    }
}

impl From<NtfyAttachment> for Attachment {
    fn from(attachment: NtfyAttachment) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            name: attachment.name,
            attachment_type: attachment
                .mime_type
                .unwrap_or_else(|| "application/octet-stream".to_string()),
            url: attachment.url,
            size: attachment.size,
        }
    }
}

impl NtfyMessage {
    /// Converts ntfy message to internal Notification format.
    ///
    /// # Arguments
    /// * `topic_id` - The subscription ID this notification belongs to
    pub fn into_notification(self, topic_id: String) -> Notification {
        let actions = self
            .actions
            .unwrap_or_default()
            .into_iter()
            .map(NotificationAction::from)
            .collect();

        let attachments = self
            .attachment
            .map(|a| vec![Attachment::from(a)])
            .unwrap_or_default();

        Notification {
            id: uuid::Uuid::new_v4().to_string(),
            topic_id,
            title: self.title.unwrap_or_default(),
            message: self.message.unwrap_or_default(),
            priority: Priority::from(self.priority.unwrap_or(3)),
            tags: self.tags.unwrap_or_default(),
            timestamp: self.time * 1000, // Convert to milliseconds
            actions,
            attachments,
            read: false,
        }
    }

    /// Returns the ntfy message ID (used for deduplication).
    pub fn ntfy_id(&self) -> &str {
        &self.id
    }
}

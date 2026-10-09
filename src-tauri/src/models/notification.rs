//! Notification data structures and ntfy message conversion.
//!
//! Defines the internal notification format and provides conversion
//! from ntfy's wire format to the application's internal representation.

use serde::{Deserialize, Serialize};
use serde_repr::{Deserialize_repr, Serialize_repr};
use specta::Type;

use base64::{engine::general_purpose::STANDARD, Engine};

use super::emoji::emoji_for_tag;

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
    /// Exported as a TS `number`: safe for millisecond timestamps until year 285,616.
    #[specta(type = specta_typescript::Number)]
    pub timestamp: i64,
    pub actions: Vec<NotificationAction>,
    pub attachments: Vec<Attachment>,
    pub read: bool,
    /// Whether the notification is expanded in compact view mode.
    pub is_expanded: bool,
    /// Whether the notification is marked as favorite.
    pub is_favorite: bool,
    /// Whether an ignore rule currently hides this notification.
    /// Computed on read, never stored.
    pub ignored: bool,
    /// Render the message as markdown (the publisher sent `text/markdown`).
    pub markdown: bool,
    /// URL to open when the notification is clicked.
    pub click: Option<String>,
    /// Remote image to show as the notification's icon.
    pub icon: Option<String>,
    /// Emoji for the tags that are emoji shortcodes, shown before the title.
    /// Computed on read; those tags are left out of `tags`.
    pub emojis: Vec<String>,
}

impl Notification {
    /// Moves tags that are emoji shortcodes from `tags` to `emojis`.
    pub fn with_emojis(mut self) -> Self {
        let (emojis, tags): (Vec<_>, Vec<_>) = std::mem::take(&mut self.tags)
            .into_iter()
            .partition(|t| emoji_for_tag(t).is_some());
        self.emojis = emojis
            .iter()
            .filter_map(|t| emoji_for_tag(t).map(str::to_string))
            .collect();
        self.tags = tags;
        self
    }

    /// The title as shown in a toast: tag emoji, then the title, or the topic without one.
    pub fn display_title(&self, topic_name: &str) -> String {
        let title = if self.title.is_empty() {
            topic_name
        } else {
            &self.title
        };
        if self.emojis.is_empty() {
            title.to_string()
        } else {
            format!("{} {title}", self.emojis.concat())
        }
    }
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
    pub attachment_type: String,
    pub url: String,
    #[specta(type = Option<specta_typescript::Number>)]
    pub size: Option<i64>,
    /// When the server deletes the file (unix seconds); after that it's gone (404).
    #[serde(default)]
    #[specta(type = Option<specta_typescript::Number>)]
    pub expires: Option<i64>,
    /// Hosted elsewhere (`attach=` URL), not on the topic's server.
    #[serde(default)]
    pub external: bool,
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
    /// Shared by all versions of a message; missing means it equals `id`.
    pub sequence_id: Option<String>,
    pub content_type: Option<String>,
    /// `base64` when the message body is base64-encoded.
    pub encoding: Option<String>,
    pub icon: Option<String>,
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
    pub expires: Option<i64>,
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
            expires: attachment.expires,
            external: false,
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

        let message = self.message.unwrap_or_default();
        let message = if self.encoding.as_deref() == Some("base64") {
            STANDARD.decode(message.trim()).map_or(message, |bytes| {
                String::from_utf8_lossy(&bytes).into_owned()
            })
        } else {
            message
        };

        Notification {
            id: uuid::Uuid::new_v4().to_string(),
            topic_id,
            title: self.title.unwrap_or_default(),
            message,
            priority: Priority::from(self.priority.unwrap_or(3)),
            tags: self.tags.unwrap_or_default(),
            timestamp: self.time * 1000, // Convert to milliseconds
            actions,
            attachments,
            read: false,
            is_expanded: false,
            is_favorite: false,
            ignored: false,
            markdown: self
                .content_type
                .is_some_and(|t| t.starts_with("text/markdown")),
            click: self.click,
            icon: self.icon,
            emojis: Vec::new(),
        }
    }

    /// Returns the ntfy message ID (used for deduplication).
    pub fn ntfy_id(&self) -> &str {
        &self.id
    }

    /// The sequence this message (or delete/clear event) belongs to.
    pub fn sequence_id(&self) -> &str {
        self.sequence_id.as_deref().unwrap_or(&self.id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn message(json: &str) -> Notification {
        serde_json::from_str::<NtfyMessage>(json)
            .unwrap()
            .into_notification("sub".to_string())
    }

    #[test]
    fn decodes_base64_and_flags_markdown() {
        let n = message(
            r#"{"id":"a","time":1,"event":"message","topic":"t","message":"aGVsbG8=","encoding":"base64","content_type":"text/markdown"}"#,
        );
        assert_eq!(n.message, "hello");
        assert!(n.markdown);
        assert!(
            !message(r#"{"id":"a","time":1,"event":"message","topic":"t","message":"x"}"#).markdown
        );
    }

    #[test]
    fn emoji_tags_go_before_the_title() {
        let n = message(
            r#"{"id":"a","time":1,"event":"message","topic":"t","title":"Disk","tags":["warning","backup"]}"#,
        )
        .with_emojis();
        assert_eq!(n.tags, ["backup"]);
        assert_eq!(n.display_title("topic"), "\u{26a0}\u{fe0f} Disk");

        let untitled = message(r#"{"id":"a","time":1,"event":"message","topic":"t"}"#);
        assert_eq!(untitled.display_title("alerts"), "alerts");
    }
}

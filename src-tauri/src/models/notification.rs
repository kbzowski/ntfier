use serde::{Deserialize, Serialize};
use serde_repr::{Deserialize_repr, Serialize_repr};
use specta::Type;

/// Notification priority levels (1-5)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize_repr, Deserialize_repr, Type)]
#[repr(u8)]
pub enum Priority {
    Min = 1,
    Low = 2,
    Default = 3,
    High = 4,
    Max = 5,
}

impl Default for Priority {
    fn default() -> Self {
        Priority::Default
    }
}

impl From<i8> for Priority {
    fn from(value: i8) -> Self {
        match value {
            1 => Priority::Min,
            2 => Priority::Low,
            4 => Priority::High,
            5 => Priority::Max,
            _ => Priority::Default,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Notification {
    pub id: String,
    pub topic_id: String,
    pub title: String,
    pub message: String,
    pub priority: Priority,
    pub tags: Vec<String>,
    pub timestamp: i64,
    pub actions: Vec<NotificationAction>,
    pub attachments: Vec<Attachment>,
    pub read: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct NotificationAction {
    pub id: String,
    pub label: String,
    pub url: Option<String>,
    pub method: Option<String>,
    pub clear: bool,
}

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

/// Message from ntfy WebSocket
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

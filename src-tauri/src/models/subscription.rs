use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Subscription {
    pub id: String,
    pub topic: String,
    pub server_url: String,
    pub display_name: Option<String>,
    pub unread_count: i32,
    pub last_notification: Option<i64>,
    pub muted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CreateSubscription {
    pub topic: String,
    pub server_url: String,
    pub display_name: Option<String>,
}

//! Runtime status of servers and subscriptions, never stored.

use serde::Serialize;
use specta::Type;

/// Whether the app may connect to a server. Anything but `Ok` stops every connection
/// to it until the server is edited (or, for a version problem, the app restarts).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ServerStatus {
    Ok,
    /// The server rejected the credential (401).
    NeedsCredentials,
    /// The server runs ntfy older than 2.17, or its version couldn't be confirmed.
    Unsupported {
        message: String,
    },
}

/// Payload of the `server:status` event and of `get_server_statuses`.
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ServerStatusEntry {
    pub url: String,
    pub status: ServerStatus,
}

/// Payload of the `subscription:error` event: the connection problem of one
/// subscription, or `None` once it connects again.
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SubscriptionError {
    pub id: String,
    pub message: Option<String>,
}

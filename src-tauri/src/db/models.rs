//! Diesel model structs for database tables.
//!
//! Separates Queryable (read) and Insertable (write) structs following Diesel idioms.

use diesel::prelude::*;

use super::schema::{notifications, servers, settings, subscriptions};
use super::types::{JsonActions, JsonAttachments, JsonTags};
use crate::models::{Notification, Priority, Subscription};

// ===== Server =====

/// A server row from the database (for querying).
#[derive(Debug, Clone, Queryable, Selectable)]
#[diesel(table_name = servers)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct ServerRow {
    #[allow(dead_code)]
    pub id: String,
    pub url: String,
    pub username: Option<String>,
    pub password: Option<String>,
    pub is_default: i32,
}

/// A new server to insert.
#[derive(Debug, Insertable)]
#[diesel(table_name = servers)]
pub struct NewServer<'a> {
    pub id: &'a str,
    pub url: &'a str,
    pub username: Option<&'a str>,
    pub password: Option<&'a str>,
    pub is_default: i32,
}

// ===== Subscription =====

/// A subscription row from the database (for querying).
#[allow(dead_code)]
#[derive(Debug, Clone, Queryable, Selectable)]
#[diesel(table_name = subscriptions)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct SubscriptionRow {
    pub id: String,
    pub server_id: String,
    pub topic: String,
    pub display_name: Option<String>,
    pub muted: i32,
    pub last_sync: Option<i64>,
}

/// A new subscription to insert.
#[derive(Debug, Insertable)]
#[diesel(table_name = subscriptions)]
pub struct NewSubscription<'a> {
    pub id: &'a str,
    pub server_id: &'a str,
    pub topic: &'a str,
    pub display_name: Option<&'a str>,
    pub muted: i32,
}

// ===== Notification =====

/// A notification row from the database (for querying).
#[derive(Debug, Clone, Queryable, Selectable)]
#[diesel(table_name = notifications)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct NotificationRow {
    pub id: String,
    pub subscription_id: String,
    #[allow(dead_code)]
    pub ntfy_id: Option<String>,
    pub title: Option<String>,
    pub message: String,
    pub priority: i32,
    pub tags: JsonTags,
    pub timestamp: i64,
    pub read: i32,
    pub actions: JsonActions,
    pub attachments: JsonAttachments,
    pub is_expanded: i32,
}

impl NotificationRow {
    /// Converts database row to domain Notification model.
    pub fn into_notification(self) -> Notification {
        Notification {
            id: self.id,
            topic_id: self.subscription_id,
            title: self.title.unwrap_or_default(),
            message: self.message,
            priority: Priority::from(self.priority as i8),
            tags: self.tags.into_inner(),
            timestamp: self.timestamp,
            actions: self.actions.into_inner(),
            attachments: self.attachments.into_inner(),
            read: self.read == 1,
            is_expanded: self.is_expanded == 1,
        }
    }
}

/// A new notification to insert.
#[derive(Debug, Insertable)]
#[diesel(table_name = notifications)]
pub struct NewNotification<'a> {
    pub id: &'a str,
    pub subscription_id: &'a str,
    pub ntfy_id: Option<&'a str>,
    pub title: Option<&'a str>,
    pub message: &'a str,
    pub priority: i32,
    pub tags: JsonTags,
    pub timestamp: i64,
    pub read: i32,
    pub actions: JsonActions,
    pub attachments: JsonAttachments,
    pub is_expanded: i32,
}

// ===== Setting =====

/// A setting row from the database.
#[derive(Debug, Clone, Queryable, Insertable, Selectable)]
#[diesel(table_name = settings)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct SettingRow {
    pub key: String,
    pub value: String,
}

// ===== Helper for raw SQL queries =====

/// Result row for subscription queries with aggregated data.
#[derive(Debug, QueryableByName)]
pub struct SubscriptionQueryRow {
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub id: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub topic: String,
    #[diesel(sql_type = diesel::sql_types::Text)]
    pub server_url: String,
    #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>)]
    pub display_name: Option<String>,
    #[diesel(sql_type = diesel::sql_types::Integer)]
    pub muted: i32,
    #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::BigInt>)]
    pub last_sync: Option<i64>,
    #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::BigInt>)]
    pub last_notif: Option<i64>,
    #[diesel(sql_type = diesel::sql_types::BigInt)]
    pub unread: i64,
}

impl From<SubscriptionQueryRow> for Subscription {
    fn from(row: SubscriptionQueryRow) -> Self {
        Self {
            id: row.id,
            topic: row.topic,
            server_url: row.server_url,
            display_name: row.display_name,
            muted: row.muted == 1,
            last_notification: row.last_notif,
            unread_count: row.unread as i32,
        }
    }
}

//! Notification-related database queries.

use diesel::prelude::*;

use crate::db::connection::Database;
use crate::db::models::{NewNotification, NotificationRow};
use crate::db::schema::{notifications, subscriptions};
use crate::db::types::{JsonActions, JsonAttachments, JsonTags};
use crate::error::AppError;
use crate::models::Notification;

impl Database {
    /// Gets all notifications for a subscription, ordered by timestamp descending.
    pub fn get_notifications_by_subscription(
        &self,
        subscription_id: &str,
    ) -> Result<Vec<Notification>, AppError> {
        let mut conn = self.conn()?;

        let rows: Vec<NotificationRow> = notifications::table
            .filter(notifications::subscription_id.eq(subscription_id))
            .order(notifications::timestamp.desc())
            .load(&mut *conn)?;

        Ok(rows
            .into_iter()
            .map(NotificationRow::into_notification)
            .collect())
    }

    /// Checks if a notification with the given `ntfy_id` exists.
    pub fn notification_exists_by_ntfy_id(&self, ntfy_id: &str) -> Result<bool, AppError> {
        use diesel::dsl::count_star;

        let mut conn = self.conn()?;

        let count: i64 = notifications::table
            .filter(notifications::ntfy_id.eq(ntfy_id))
            .select(count_star())
            .first(&mut *conn)?;

        Ok(count > 0)
    }

    /// Inserts or replaces a notification.
    #[allow(dead_code)]
    pub fn insert_notification(&self, notification: &Notification) -> Result<(), AppError> {
        let mut conn = self.conn()?;

        let title_ref = if notification.title.is_empty() {
            None
        } else {
            Some(notification.title.as_str())
        };

        let new_notification = NewNotification {
            id: &notification.id,
            subscription_id: &notification.topic_id,
            ntfy_id: None,
            title: title_ref,
            message: &notification.message,
            priority: notification.priority as i32,
            tags: JsonTags::new(notification.tags.clone()),
            timestamp: notification.timestamp,
            read: i32::from(notification.read),
            actions: JsonActions::new(notification.actions.clone()),
            attachments: JsonAttachments::new(notification.attachments.clone()),
            is_expanded: i32::from(notification.is_expanded),
        };

        diesel::replace_into(notifications::table)
            .values(&new_notification)
            .execute(&mut *conn)?;

        Ok(())
    }

    /// Inserts a notification with `ntfy_id` for deduplication (ignores if exists).
    pub fn insert_notification_with_ntfy_id(
        &self,
        notification: &Notification,
        ntfy_id: &str,
    ) -> Result<(), AppError> {
        let mut conn = self.conn()?;

        let title_ref = if notification.title.is_empty() {
            None
        } else {
            Some(notification.title.as_str())
        };

        let new_notification = NewNotification {
            id: &notification.id,
            subscription_id: &notification.topic_id,
            ntfy_id: Some(ntfy_id),
            title: title_ref,
            message: &notification.message,
            priority: notification.priority as i32,
            tags: JsonTags::new(notification.tags.clone()),
            timestamp: notification.timestamp,
            read: i32::from(notification.read),
            actions: JsonActions::new(notification.actions.clone()),
            attachments: JsonAttachments::new(notification.attachments.clone()),
            is_expanded: i32::from(notification.is_expanded),
        };

        diesel::insert_or_ignore_into(notifications::table)
            .values(&new_notification)
            .execute(&mut *conn)?;

        Ok(())
    }

    /// Marks a notification as read.
    pub fn mark_notification_read(&self, id: &str) -> Result<(), AppError> {
        let mut conn = self.conn()?;

        diesel::update(notifications::table.filter(notifications::id.eq(id)))
            .set(notifications::read.eq(1))
            .execute(&mut *conn)?;

        Ok(())
    }

    /// Marks all notifications in a subscription as read.
    pub fn mark_all_notifications_read(&self, subscription_id: &str) -> Result<(), AppError> {
        let mut conn = self.conn()?;

        diesel::update(
            notifications::table.filter(notifications::subscription_id.eq(subscription_id)),
        )
        .set(notifications::read.eq(1))
        .execute(&mut *conn)?;

        Ok(())
    }

    /// Sets the expanded state of a notification.
    pub fn set_notification_expanded(&self, id: &str, expanded: bool) -> Result<(), AppError> {
        let mut conn = self.conn()?;

        diesel::update(notifications::table.filter(notifications::id.eq(id)))
            .set(notifications::is_expanded.eq(i32::from(expanded)))
            .execute(&mut *conn)?;

        Ok(())
    }

    /// Gets `ntfy_id` and `subscription_id` for a notification (needed for remote delete).
    pub fn get_notification_meta(
        &self,
        id: &str,
    ) -> Result<Option<(Option<String>, String)>, AppError> {
        let mut conn = self.conn()?;

        let result: Option<(Option<String>, String)> = notifications::table
            .filter(notifications::id.eq(id))
            .select((notifications::ntfy_id, notifications::subscription_id))
            .first(&mut *conn)
            .optional()?;

        Ok(result)
    }

    /// Deletes a notification.
    pub fn delete_notification(&self, id: &str) -> Result<(), AppError> {
        let mut conn = self.conn()?;

        diesel::delete(notifications::table.filter(notifications::id.eq(id)))
            .execute(&mut *conn)?;

        Ok(())
    }

    /// Gets the unread count for a subscription.
    pub fn get_unread_count(&self, subscription_id: &str) -> Result<i32, AppError> {
        use diesel::dsl::count_star;

        let mut conn = self.conn()?;

        let count: i64 = notifications::table
            .filter(notifications::subscription_id.eq(subscription_id))
            .filter(notifications::read.eq(0))
            .select(count_star())
            .first(&mut *conn)?;

        Ok(count as i32)
    }

    /// Gets the total unread count across all non-muted subscriptions.
    pub fn get_total_unread_count(&self) -> Result<i32, AppError> {
        use diesel::dsl::count_star;

        let mut conn = self.conn()?;

        let count: i64 = notifications::table
            .inner_join(subscriptions::table)
            .filter(notifications::read.eq(0))
            .filter(subscriptions::muted.eq(0))
            .select(count_star())
            .first(&mut *conn)?;

        Ok(count as i32)
    }
}

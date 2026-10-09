//! Notification-related database queries.

use diesel::prelude::*;

use crate::db::connection::Database;
use crate::db::models::{NewNotification, NotificationRow};
use crate::db::schema::{notifications, subscriptions};
use crate::db::types::{JsonActions, JsonAttachments, JsonTags};
use crate::error::AppError;
use crate::models::{is_ignored, Notification};

impl Database {
    /// Gets all notifications for a subscription, ordered by timestamp descending.
    pub fn get_notifications_by_subscription(
        &self,
        subscription_id: &str,
    ) -> Result<Vec<Notification>, AppError> {
        let rules = self.get_ignore_rules()?;

        let mut conn = self.conn()?;

        let rows: Vec<NotificationRow> = notifications::table
            .filter(notifications::subscription_id.eq(subscription_id))
            .filter(notifications::deleted.eq(0))
            .order(notifications::timestamp.desc())
            .load(&mut *conn)?;

        Ok(rows
            .into_iter()
            .map(NotificationRow::into_notification)
            .map(|mut n| {
                n.ignored = is_ignored(&n.title, &n.topic_id, &rules);
                n
            })
            .collect())
    }

    /// Inserts a notification unless its `ntfy_id` is already stored (tombstones included).
    ///
    /// Returns whether a row was inserted.
    pub fn insert_notification_with_ntfy_id(
        &self,
        notification: &Notification,
        ntfy_id: &str,
    ) -> Result<bool, AppError> {
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
            is_favorite: i32::from(notification.is_favorite),
        };

        let inserted = diesel::insert_or_ignore_into(notifications::table)
            .values(&new_notification)
            .execute(&mut *conn)?;

        Ok(inserted == 1)
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

    /// Sets the favorite state of a notification.
    pub fn set_notification_favorite(&self, id: &str, favorite: bool) -> Result<(), AppError> {
        let mut conn = self.conn()?;

        diesel::update(notifications::table.filter(notifications::id.eq(id)))
            .set(notifications::is_favorite.eq(i32::from(favorite)))
            .execute(&mut *conn)?;

        Ok(())
    }

    /// Gets all favorite notifications, ordered by timestamp descending.
    pub fn get_favorite_notifications(&self) -> Result<Vec<Notification>, AppError> {
        let rules = self.get_ignore_rules()?;

        let mut conn = self.conn()?;

        let rows: Vec<NotificationRow> = notifications::table
            .filter(notifications::is_favorite.eq(1))
            .filter(notifications::deleted.eq(0))
            .order(notifications::timestamp.desc())
            .load(&mut *conn)?;

        Ok(rows
            .into_iter()
            .map(NotificationRow::into_notification)
            .map(|mut n| {
                n.ignored = is_ignored(&n.title, &n.topic_id, &rules);
                n
            })
            .collect())
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

    /// Deletes a notification, keeping a hidden tombstone so a replay can't bring it back.
    pub fn delete_notification(&self, id: &str) -> Result<(), AppError> {
        let mut conn = self.conn()?;

        diesel::update(notifications::table.filter(notifications::id.eq(id)))
            .set(notifications::deleted.eq(1))
            .execute(&mut *conn)?;

        Ok(())
    }

    /// Gets the unread count for a subscription, excluding ignored notifications.
    pub fn get_unread_count(&self, subscription_id: &str) -> Result<i32, AppError> {
        use diesel::dsl::count_star;

        let rules = self.get_ignore_rules()?;

        let mut conn = self.conn()?;

        if rules.is_empty() {
            let count: i64 = notifications::table
                .filter(notifications::subscription_id.eq(subscription_id))
                .filter(notifications::read.eq(0))
                .filter(notifications::deleted.eq(0))
                .select(count_star())
                .first(&mut *conn)?;

            return Ok(count as i32);
        }

        let titles: Vec<Option<String>> = notifications::table
            .filter(notifications::subscription_id.eq(subscription_id))
            .filter(notifications::read.eq(0))
            .filter(notifications::deleted.eq(0))
            .select(notifications::title)
            .load(&mut *conn)?;

        let count = titles
            .into_iter()
            .filter(|t| !is_ignored(t.as_deref().unwrap_or(""), subscription_id, &rules))
            .count();

        Ok(count as i32)
    }

    /// Gets the total unread count across all non-muted subscriptions,
    /// excluding ignored notifications.
    pub fn get_total_unread_count(&self) -> Result<i32, AppError> {
        use diesel::dsl::count_star;

        let rules = self.get_ignore_rules()?;

        let mut conn = self.conn()?;

        if rules.is_empty() {
            let count: i64 = notifications::table
                .inner_join(subscriptions::table)
                .filter(notifications::read.eq(0))
                .filter(notifications::deleted.eq(0))
                .filter(subscriptions::muted.eq(0))
                .select(count_star())
                .first(&mut *conn)?;

            return Ok(count as i32);
        }

        let rows: Vec<(String, Option<String>)> = notifications::table
            .inner_join(subscriptions::table)
            .filter(notifications::read.eq(0))
            .filter(notifications::deleted.eq(0))
            .filter(subscriptions::muted.eq(0))
            .select((notifications::subscription_id, notifications::title))
            .load(&mut *conn)?;

        let count = rows
            .into_iter()
            .filter(|(sub_id, title)| !is_ignored(title.as_deref().unwrap_or(""), sub_id, &rules))
            .count();

        Ok(count as i32)
    }
}

#[cfg(test)]
pub mod tests {
    use super::*;
    use crate::models::{CreateSubscription, Priority};

    pub fn db_with_sub() -> (Database, String) {
        let db = Database::new(std::path::Path::new(":memory:")).unwrap();
        let sub = db
            .create_subscription(CreateSubscription {
                topic: "alerts".to_string(),
                server_url: "https://ntfy.sh".to_string(),
                display_name: None,
            })
            .unwrap();
        (db, sub.id)
    }

    pub fn notification(sub_id: &str, time: i64) -> Notification {
        Notification {
            id: uuid::Uuid::new_v4().to_string(),
            topic_id: sub_id.to_string(),
            title: String::new(),
            message: "hi".to_string(),
            priority: Priority::Default,
            tags: vec![],
            timestamp: time * 1000,
            actions: vec![],
            attachments: vec![],
            read: false,
            is_expanded: false,
            is_favorite: false,
            ignored: false,
        }
    }

    #[test]
    fn duplicate_ntfy_id_is_ignored() {
        let (db, sub) = db_with_sub();
        assert!(db
            .insert_notification_with_ntfy_id(&notification(&sub, 1), "m1")
            .unwrap());
        assert!(!db
            .insert_notification_with_ntfy_id(&notification(&sub, 1), "m1")
            .unwrap());
        assert_eq!(db.get_notifications_by_subscription(&sub).unwrap().len(), 1);
    }

    #[test]
    fn deleted_message_stays_hidden_after_replay() {
        let (db, sub) = db_with_sub();
        let n = notification(&sub, 1);
        db.insert_notification_with_ntfy_id(&n, "m1").unwrap();
        db.delete_notification(&n.id).unwrap();

        assert!(!db
            .insert_notification_with_ntfy_id(&notification(&sub, 1), "m1")
            .unwrap());
        assert!(db
            .get_notifications_by_subscription(&sub)
            .unwrap()
            .is_empty());
        assert_eq!(db.get_unread_count(&sub).unwrap(), 0);
        assert_eq!(db.get_total_unread_count().unwrap(), 0);
        assert_eq!(db.get_all_subscriptions().unwrap()[0].unread_count, 0);
    }

    #[test]
    fn cursor_only_moves_forward() {
        let (db, sub) = db_with_sub();
        assert_eq!(db.get_message_cursor(&sub).unwrap(), None);
        db.advance_message_cursor(&sub, 10).unwrap();
        db.advance_message_cursor(&sub, 5).unwrap();
        assert_eq!(db.get_message_cursor(&sub).unwrap(), Some(10));
    }
}

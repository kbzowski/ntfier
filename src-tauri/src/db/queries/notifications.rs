//! Notification-related database queries.

use diesel::prelude::*;
use diesel::Connection;

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
            .filter(notifications::superseded.eq(0))
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

    /// Replaces a message with the text of its inlined `.txt` attachment and drops the file.
    pub fn inline_text_attachment(&self, id: &str, text: &str) -> Result<(), AppError> {
        let mut conn = self.conn()?;
        diesel::update(notifications::table.filter(notifications::id.eq(id)))
            .set((
                notifications::message.eq(text),
                notifications::attachments.eq(JsonAttachments::new(vec![])),
            ))
            .execute(&mut *conn)?;
        Ok(())
    }

    /// One stored message by id.
    pub fn get_notification(&self, id: &str) -> Result<Option<Notification>, AppError> {
        let mut conn = self.conn()?;
        // Hidden rows don't count: an old toast must not run a deleted message's action
        let row: Option<NotificationRow> = notifications::table
            .filter(notifications::id.eq(id))
            .filter(notifications::deleted.eq(0))
            .filter(notifications::superseded.eq(0))
            .first(&mut *conn)
            .optional()?;
        Ok(row.map(NotificationRow::into_notification))
    }

    /// Whether a message with this `ntfy_id` is stored (tombstones included).
    pub fn notification_exists(&self, ntfy_id: &str) -> Result<bool, AppError> {
        let mut conn = self.conn()?;
        Ok(diesel::select(diesel::dsl::exists(
            notifications::table.filter(notifications::ntfy_id.eq(ntfy_id)),
        ))
        .get_result(&mut *conn)?)
    }

    /// Inserts a notification unless its `ntfy_id` is already stored (tombstones included).
    ///
    /// The new row becomes the visible version of its sequence: it inherits the favorite
    /// flag of the version it replaces, and every other version is marked superseded.
    /// Returns whether a row was inserted.
    pub fn insert_notification_with_ntfy_id(
        &self,
        notification: &Notification,
        ntfy_id: &str,
        sequence_id: &str,
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
            sequence_id: Some(sequence_id),
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
            markdown: i32::from(notification.markdown),
            click: notification.click.as_deref(),
            icon: notification.icon.as_deref(),
        };

        let in_sequence = notifications::subscription_id
            .eq(&notification.topic_id)
            .and(notifications::sequence_id.eq(sequence_id));

        let inserted = conn.transaction::<_, diesel::result::Error, _>(|conn| {
            let previous_favorite: Option<i32> = notifications::table
                .filter(in_sequence)
                .order((notifications::timestamp.desc(), notifications::id.desc()))
                .select(notifications::is_favorite)
                .first(conn)
                .optional()?;

            let inserted = diesel::insert_or_ignore_into(notifications::table)
                .values(NewNotification {
                    is_favorite: previous_favorite.unwrap_or(new_notification.is_favorite),
                    ..new_notification
                })
                .execute(conn)?;
            if inserted == 0 {
                return Ok(false);
            }

            // Only the newest version stays visible (a replay may deliver an older one later)
            diesel::sql_query(
                "UPDATE notifications SET superseded = (id != ( \
                     SELECT id FROM notifications WHERE subscription_id = ?1 AND sequence_id = ?2 \
                     ORDER BY timestamp DESC, rowid DESC LIMIT 1)) \
                 WHERE subscription_id = ?1 AND sequence_id = ?2",
            )
            .bind::<diesel::sql_types::Text, _>(&notification.topic_id)
            .bind::<diesel::sql_types::Text, _>(sequence_id)
            .execute(conn)?;
            Ok(true)
        })?;

        Ok(inserted)
    }

    /// Applies a server `message_delete`: hides the sequence's versions up to `time` (ms).
    pub fn delete_sequence(
        &self,
        subscription_id: &str,
        sequence_id: &str,
        time: i64,
    ) -> Result<(), AppError> {
        let mut conn = self.conn()?;

        diesel::update(
            notifications::table
                .filter(notifications::subscription_id.eq(subscription_id))
                .filter(notifications::sequence_id.eq(sequence_id))
                .filter(notifications::timestamp.le(time)),
        )
        .set(notifications::deleted.eq(1))
        .execute(&mut *conn)?;

        Ok(())
    }

    /// Applies a server `message_clear`: marks the sequence's versions up to `time` (ms) read.
    pub fn clear_sequence(
        &self,
        subscription_id: &str,
        sequence_id: &str,
        time: i64,
    ) -> Result<(), AppError> {
        let mut conn = self.conn()?;

        diesel::update(
            notifications::table
                .filter(notifications::subscription_id.eq(subscription_id))
                .filter(notifications::sequence_id.eq(sequence_id))
                .filter(notifications::timestamp.le(time)),
        )
        .set(notifications::read.eq(1))
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
            .filter(notifications::superseded.eq(0))
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

    /// Gets the sequence id (falling back to `ntfy_id`) and `subscription_id` of a
    /// notification, needed for remote delete.
    pub fn get_notification_meta(
        &self,
        id: &str,
    ) -> Result<Option<(Option<String>, String)>, AppError> {
        let mut conn = self.conn()?;

        let result: Option<(Option<String>, Option<String>, String)> = notifications::table
            .filter(notifications::id.eq(id))
            .select((
                notifications::sequence_id,
                notifications::ntfy_id,
                notifications::subscription_id,
            ))
            .first(&mut *conn)
            .optional()?;

        Ok(result.map(|(seq, ntfy_id, sub)| (seq.or(ntfy_id), sub)))
    }

    /// Deletes a notification, keeping a hidden tombstone so a replay can't bring it back.
    pub fn delete_notification(&self, id: &str) -> Result<(), AppError> {
        let mut conn = self.conn()?;

        diesel::update(notifications::table.filter(notifications::id.eq(id)))
            .set(notifications::deleted.eq(1))
            .execute(&mut *conn)?;

        Ok(())
    }

    /// Applies retention: hard-deletes non-favorite notifications past the limits
    /// (including tombstoned and superseded rows). `None` means the limit is off.
    /// Returns how many notifications were removed. The subscription cursor is untouched.
    pub fn apply_retention(
        &self,
        max_age_days: Option<u32>,
        max_per_subscription: Option<u32>,
    ) -> Result<usize, AppError> {
        let mut conn = self.conn()?;
        let mut removed = 0;

        if let Some(days) = max_age_days {
            let cutoff = chrono::Utc::now().timestamp_millis() - i64::from(days) * 86_400_000;
            removed += diesel::delete(
                notifications::table
                    .filter(notifications::is_favorite.eq(0))
                    .filter(notifications::timestamp.lt(cutoff)),
            )
            .execute(&mut *conn)?;
        }

        if let Some(max) = max_per_subscription {
            removed += diesel::sql_query(
                "DELETE FROM notifications WHERE id IN (                      SELECT id FROM (                          SELECT id, ROW_NUMBER() OVER (                              PARTITION BY subscription_id ORDER BY timestamp DESC, rowid DESC) AS n                          FROM notifications WHERE is_favorite = 0)                      WHERE n > ?)",
            )
            .bind::<diesel::sql_types::BigInt, _>(i64::from(max))
            .execute(&mut *conn)?;
        }

        Ok(removed)
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
                .filter(notifications::superseded.eq(0))
                .select(count_star())
                .first(&mut *conn)?;

            return Ok(count as i32);
        }

        let titles: Vec<Option<String>> = notifications::table
            .filter(notifications::subscription_id.eq(subscription_id))
            .filter(notifications::read.eq(0))
            .filter(notifications::deleted.eq(0))
            .filter(notifications::superseded.eq(0))
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
                .filter(notifications::superseded.eq(0))
                .filter(subscriptions::muted.eq(0))
                .select(count_star())
                .first(&mut *conn)?;

            return Ok(count as i32);
        }

        let rows: Vec<(String, Option<String>)> = notifications::table
            .inner_join(subscriptions::table)
            .filter(notifications::read.eq(0))
            .filter(notifications::deleted.eq(0))
            .filter(notifications::superseded.eq(0))
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
            markdown: false,
            click: None,
            icon: None,
            emojis: vec![],
            sequence_id: None,
        }
    }

    #[test]
    fn duplicate_ntfy_id_is_ignored() {
        let (db, sub) = db_with_sub();
        assert!(db
            .insert_notification_with_ntfy_id(&notification(&sub, 1), "m1", "m1")
            .unwrap());
        assert!(!db
            .insert_notification_with_ntfy_id(&notification(&sub, 1), "m1", "m1")
            .unwrap());
        assert_eq!(db.get_notifications_by_subscription(&sub).unwrap().len(), 1);
    }

    #[test]
    fn deleted_message_stays_hidden_after_replay() {
        let (db, sub) = db_with_sub();
        let n = notification(&sub, 1);
        db.insert_notification_with_ntfy_id(&n, "m1", "m1").unwrap();
        db.delete_notification(&n.id).unwrap();

        assert!(!db
            .insert_notification_with_ntfy_id(&notification(&sub, 1), "m1", "m1")
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

    #[test]
    fn update_supersedes_and_inherits_favorite() {
        let (db, sub) = db_with_sub();
        let first = notification(&sub, 1);
        db.insert_notification_with_ntfy_id(&first, "m1", "seq")
            .unwrap();
        db.set_notification_favorite(&first.id, true).unwrap();
        db.mark_notification_read(&first.id).unwrap();

        let mut update = notification(&sub, 2);
        update.message = "updated".to_string();
        db.insert_notification_with_ntfy_id(&update, "m2", "seq")
            .unwrap();

        let visible = db.get_notifications_by_subscription(&sub).unwrap();
        assert_eq!(visible.len(), 1);
        assert_eq!(visible[0].message, "updated");
        assert!(visible[0].is_favorite);
        assert!(!visible[0].read);
        assert_eq!(db.get_unread_count(&sub).unwrap(), 1);
    }

    #[test]
    fn older_version_arriving_late_stays_hidden() {
        let (db, sub) = db_with_sub();
        db.insert_notification_with_ntfy_id(&notification(&sub, 2), "m2", "seq")
            .unwrap();
        db.insert_notification_with_ntfy_id(&notification(&sub, 1), "m1", "seq")
            .unwrap();
        let visible = db.get_notifications_by_subscription(&sub).unwrap();
        assert_eq!(visible.len(), 1);
        assert_eq!(visible[0].timestamp, 2000);
    }

    #[test]
    fn server_delete_and_clear_hit_versions_up_to_event_time() {
        let (db, sub) = db_with_sub();
        db.insert_notification_with_ntfy_id(&notification(&sub, 1), "m1", "a")
            .unwrap();
        db.insert_notification_with_ntfy_id(&notification(&sub, 1), "m2", "b")
            .unwrap();

        db.clear_sequence(&sub, "b", 1000).unwrap();
        assert_eq!(db.get_unread_count(&sub).unwrap(), 1);

        db.delete_sequence(&sub, "a", 999).unwrap();
        assert_eq!(db.get_notifications_by_subscription(&sub).unwrap().len(), 2);
        db.delete_sequence(&sub, "a", 1000).unwrap();
        assert_eq!(db.get_notifications_by_subscription(&sub).unwrap().len(), 1);

        // A later message with the same sequence revives it
        db.insert_notification_with_ntfy_id(&notification(&sub, 3), "m3", "a")
            .unwrap();
        assert_eq!(db.get_notifications_by_subscription(&sub).unwrap().len(), 2);
    }

    #[test]
    fn inlined_text_replaces_message_and_drops_file() {
        let (db, sub) = db_with_sub();
        let mut n = notification(&sub, 1);
        n.attachments = vec![crate::models::Attachment {
            id: "f".to_string(),
            name: "attachment.txt".to_string(),
            attachment_type: "text/plain".to_string(),
            url: "https://ntfy.sh/file/a.txt".to_string(),
            size: Some(5000),
            expires: None,
            external: false,
        }];
        db.insert_notification_with_ntfy_id(&n, "m1", "m1").unwrap();
        db.inline_text_attachment(&n.id, "long text").unwrap();

        let stored = db.get_notification(&n.id).unwrap().unwrap();
        assert_eq!(stored.message, "long text");
        assert!(stored.attachments.is_empty());
    }

    fn days_ago(days: i64) -> i64 {
        chrono::Utc::now().timestamp() - days * 86_400
    }

    #[test]
    fn retention_by_age_removes_only_older_notifications() {
        let (db, sub) = db_with_sub();
        let old = notification(&sub, days_ago(10));
        let fresh = notification(&sub, days_ago(1));
        db.insert_notification_with_ntfy_id(&old, "m1", "m1")
            .unwrap();
        db.insert_notification_with_ntfy_id(&fresh, "m2", "m2")
            .unwrap();

        assert_eq!(db.apply_retention(Some(7), None).unwrap(), 1);

        let visible = db.get_notifications_by_subscription(&sub).unwrap();
        assert_eq!(visible.len(), 1);
        assert_eq!(visible[0].id, fresh.id);
    }

    #[test]
    fn retention_keeps_favorites() {
        let (db, sub) = db_with_sub();
        let old = notification(&sub, days_ago(10));
        db.insert_notification_with_ntfy_id(&old, "m1", "m1")
            .unwrap();
        db.set_notification_favorite(&old.id, true).unwrap();

        assert_eq!(db.apply_retention(Some(7), None).unwrap(), 0);
        assert_eq!(db.get_favorite_notifications().unwrap().len(), 1);
    }

    #[test]
    fn retention_off_removes_nothing() {
        let (db, sub) = db_with_sub();
        db.insert_notification_with_ntfy_id(&notification(&sub, days_ago(1000)), "m1", "m1")
            .unwrap();

        assert_eq!(db.apply_retention(None, None).unwrap(), 0);
        assert_eq!(db.get_notifications_by_subscription(&sub).unwrap().len(), 1);
    }

    #[test]
    fn retention_leaves_cursor_unchanged() {
        let (db, sub) = db_with_sub();
        let time = days_ago(10);
        db.insert_notification_with_ntfy_id(&notification(&sub, time), "m1", "m1")
            .unwrap();
        db.advance_message_cursor(&sub, time).unwrap();

        db.apply_retention(Some(7), None).unwrap();
        assert_eq!(db.get_message_cursor(&sub).unwrap(), Some(time));
    }

    #[test]
    fn retention_removes_unread_like_read() {
        let (db, sub) = db_with_sub();
        let read = notification(&sub, days_ago(10));
        db.insert_notification_with_ntfy_id(&read, "m1", "m1")
            .unwrap();
        db.mark_notification_read(&read.id).unwrap();
        db.insert_notification_with_ntfy_id(&notification(&sub, days_ago(9)), "m2", "m2")
            .unwrap();

        assert_eq!(db.apply_retention(Some(7), None).unwrap(), 2);
        assert_eq!(db.get_unread_count(&sub).unwrap(), 0);
        assert!(db
            .get_notifications_by_subscription(&sub)
            .unwrap()
            .is_empty());
    }

    /// Inserts one notification per time (seconds) and returns their ids in that order.
    fn insert_at(db: &Database, sub: &str, times: &[i64]) -> Vec<String> {
        times
            .iter()
            .map(|&t| {
                let n = notification(sub, t);
                let ntfy_id = format!("{sub}-{t}");
                db.insert_notification_with_ntfy_id(&n, &ntfy_id, &ntfy_id)
                    .unwrap();
                n.id
            })
            .collect()
    }

    fn visible_ids(db: &Database, sub: &str) -> Vec<String> {
        db.get_notifications_by_subscription(sub)
            .unwrap()
            .into_iter()
            .map(|n| n.id)
            .collect()
    }

    #[test]
    fn retention_by_count_keeps_newest_per_subscription() {
        let (db, busy) = db_with_sub();
        let quiet = db
            .create_subscription(CreateSubscription {
                topic: "quiet".to_string(),
                server_url: "https://ntfy.sh".to_string(),
                display_name: None,
            })
            .unwrap()
            .id;
        // Inserted out of order so "newest" must come from the timestamp
        let busy_ids = insert_at(&db, &busy, &[3, 5, 1, 4, 2]);
        let quiet_ids = insert_at(&db, &quiet, &[1, 2]);

        assert_eq!(db.apply_retention(None, Some(2)).unwrap(), 3);

        assert_eq!(
            visible_ids(&db, &busy),
            vec![busy_ids[1].clone(), busy_ids[3].clone()]
        );
        assert_eq!(
            visible_ids(&db, &quiet),
            vec![quiet_ids[1].clone(), quiet_ids[0].clone()]
        );
    }

    #[test]
    fn retention_by_count_ignores_favorites() {
        let (db, sub) = db_with_sub();
        let ids = insert_at(&db, &sub, &[1, 2, 3, 4]);
        db.set_notification_favorite(&ids[0], true).unwrap();
        db.set_notification_favorite(&ids[3], true).unwrap();

        // Favorites stay and don't use up the limit: the newest non-favorite is kept
        assert_eq!(db.apply_retention(None, Some(1)).unwrap(), 1);
        assert_eq!(
            visible_ids(&db, &sub),
            vec![ids[3].clone(), ids[2].clone(), ids[0].clone()]
        );
    }

    #[test]
    fn retention_applies_both_limits_together() {
        let (db, sub) = db_with_sub();
        let ids = insert_at(
            &db,
            &sub,
            &[days_ago(10), days_ago(3), days_ago(2), days_ago(1)],
        );

        // Age removes the 10-day-old one, count trims the rest to the newest two
        assert_eq!(db.apply_retention(Some(7), Some(2)).unwrap(), 2);
        assert_eq!(visible_ids(&db, &sub), vec![ids[3].clone(), ids[2].clone()]);
    }
}

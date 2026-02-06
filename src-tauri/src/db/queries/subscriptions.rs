//! Subscription-related database queries.

use diesel::prelude::*;
use diesel::sql_query;
use diesel::Connection;

use crate::db::connection::Database;
use crate::db::models::{NewServer, NewSubscription, SubscriptionQueryRow};
use crate::db::schema::{servers, subscriptions};
use crate::error::AppError;
use crate::models::{CreateSubscription, Subscription};

impl Database {
    /// Returns all subscriptions ordered by most recent notification.
    pub fn get_all_subscriptions(&self) -> Result<Vec<Subscription>, AppError> {
        let mut conn = self.conn()?;

        let rows: Vec<SubscriptionQueryRow> = sql_query(
            "SELECT s.id, s.topic, srv.url as server_url, s.display_name, s.muted, s.last_sync,
                    (SELECT MAX(n.timestamp) FROM notifications n WHERE n.subscription_id = s.id) as last_notif,
                    (SELECT COUNT(*) FROM notifications n WHERE n.subscription_id = s.id AND n.read = 0) as unread
             FROM subscriptions s
             JOIN servers srv ON s.server_id = srv.id
             ORDER BY last_notif DESC NULLS LAST",
        )
        .load(&mut *conn)?;

        Ok(rows.into_iter().map(Subscription::from).collect())
    }

    /// Gets a subscription with its last sync timestamp.
    pub fn get_subscription_with_last_sync(
        &self,
        id: &str,
    ) -> Result<Option<(Subscription, Option<i64>)>, AppError> {
        let mut conn = self.conn()?;

        let rows: Vec<SubscriptionQueryRow> = sql_query(
            "SELECT s.id, s.topic, srv.url as server_url, s.display_name, s.muted, s.last_sync,
                    (SELECT MAX(n.timestamp) FROM notifications n WHERE n.subscription_id = s.id) as last_notif,
                    (SELECT COUNT(*) FROM notifications n WHERE n.subscription_id = s.id AND n.read = 0) as unread
             FROM subscriptions s
             JOIN servers srv ON s.server_id = srv.id
             WHERE s.id = ?",
        )
        .bind::<diesel::sql_types::Text, _>(id)
        .load(&mut *conn)?;

        Ok(rows.into_iter().next().map(|row| {
            let last_sync = row.last_sync;
            (Subscription::from(row), last_sync)
        }))
    }

    /// Updates the last sync timestamp for a subscription.
    pub fn update_subscription_last_sync(&self, id: &str, timestamp: i64) -> Result<(), AppError> {
        let mut conn = self.conn()?;

        diesel::update(subscriptions::table.filter(subscriptions::id.eq(id)))
            .set(subscriptions::last_sync.eq(timestamp))
            .execute(&mut *conn)?;

        Ok(())
    }

    /// Creates a new subscription.
    pub fn create_subscription(&self, sub: CreateSubscription) -> Result<Subscription, AppError> {
        sub.validate()?;
        let mut conn = self.conn()?;

        let (id, server_url, topic, display_name) = conn
            .transaction::<_, diesel::result::Error, _>(|conn| {
                // Get or create server
                let server_id: String = servers::table
                    .filter(servers::url.eq(&sub.server_url))
                    .select(servers::id)
                    .first(conn)
                    .optional()?
                    .unwrap_or_else(|| {
                        let new_id = uuid::Uuid::new_v4().to_string();
                        let new_server = NewServer {
                            id: &new_id,
                            url: &sub.server_url,
                            username: None,
                            password: None,
                            is_default: 0,
                        };

                        diesel::insert_into(servers::table)
                            .values(&new_server)
                            .execute(conn)
                            .ok();

                        new_id
                    });

                let id = uuid::Uuid::new_v4().to_string();
                let display_name_ref = sub.display_name.as_deref().filter(|s| !s.is_empty());

                let new_subscription = NewSubscription {
                    id: &id,
                    server_id: &server_id,
                    topic: &sub.topic,
                    display_name: display_name_ref,
                    muted: 0,
                };

                diesel::insert_into(subscriptions::table)
                    .values(&new_subscription)
                    .execute(conn)?;

                Ok((id, sub.server_url, sub.topic, sub.display_name))
            })?;

        Ok(Subscription {
            id,
            topic,
            server_url,
            display_name,
            unread_count: 0,
            last_notification: None,
            muted: false,
        })
    }

    /// Deletes a subscription and all its notifications (via ON DELETE CASCADE).
    pub fn delete_subscription(&self, id: &str) -> Result<(), AppError> {
        let mut conn = self.conn()?;

        diesel::delete(subscriptions::table.filter(subscriptions::id.eq(id)))
            .execute(&mut *conn)?;

        Ok(())
    }

    /// Toggles the mute state of a subscription.
    pub fn toggle_subscription_mute(&self, id: &str) -> Result<Subscription, AppError> {
        {
            let mut conn = self.conn()?;

            // Use raw SQL for NOT toggle (Diesel doesn't support this directly)
            sql_query("UPDATE subscriptions SET muted = NOT muted WHERE id = ?")
                .bind::<diesel::sql_types::Text, _>(id)
                .execute(&mut *conn)?;
        }

        // Return updated subscription
        self.get_subscription_by_id(id)?
            .ok_or_else(|| AppError::NotFound(format!("Subscription {id} not found")))
    }

    /// Gets a subscription by ID.
    #[allow(dead_code)]
    pub fn get_subscription_by_id(&self, id: &str) -> Result<Option<Subscription>, AppError> {
        let mut conn = self.conn()?;

        let rows: Vec<SubscriptionQueryRow> = sql_query(
            "SELECT s.id, s.topic, srv.url as server_url, s.display_name, s.muted, s.last_sync,
                    (SELECT MAX(n.timestamp) FROM notifications n WHERE n.subscription_id = s.id) as last_notif,
                    (SELECT COUNT(*) FROM notifications n WHERE n.subscription_id = s.id AND n.read = 0) as unread
             FROM subscriptions s
             JOIN servers srv ON s.server_id = srv.id
             WHERE s.id = ?",
        )
        .bind::<diesel::sql_types::Text, _>(id)
        .load(&mut *conn)?;

        Ok(rows.into_iter().next().map(Subscription::from))
    }
}

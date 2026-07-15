//! Ignore rule database queries.

use diesel::prelude::*;

use crate::db::connection::Database;
use crate::db::models::{IgnoreRuleRow, NewIgnoreRule};
use crate::db::schema::ignore_rules;
use crate::error::AppError;
use crate::models::IgnoreRule;

impl From<IgnoreRuleRow> for IgnoreRule {
    fn from(row: IgnoreRuleRow) -> Self {
        Self {
            id: row.id,
            pattern: row.pattern,
            subscription_id: row.subscription_id,
            created_at: row.created_at,
        }
    }
}

impl Database {
    /// Returns all ignore rules, oldest first.
    pub fn get_ignore_rules(&self) -> Result<Vec<IgnoreRule>, AppError> {
        let mut conn = self.conn()?;

        let rows: Vec<IgnoreRuleRow> = ignore_rules::table
            .order(ignore_rules::created_at.asc())
            .load(&mut *conn)?;

        Ok(rows.into_iter().map(IgnoreRule::from).collect())
    }

    /// Creates an ignore rule. A `subscription_id` of `None` makes it global.
    pub fn add_ignore_rule(
        &self,
        pattern: &str,
        subscription_id: Option<&str>,
    ) -> Result<IgnoreRule, AppError> {
        let pattern = pattern.trim();
        if pattern.is_empty() {
            return Err(AppError::Validation(
                "Ignore pattern cannot be empty".to_string(),
            ));
        }

        let id = uuid::Uuid::new_v4().to_string();
        let created_at = chrono::Utc::now().timestamp_millis();

        {
            let mut conn = self.conn()?;
            let new_rule = NewIgnoreRule {
                id: &id,
                pattern,
                subscription_id,
                created_at,
            };

            diesel::insert_into(ignore_rules::table)
                .values(&new_rule)
                .execute(&mut *conn)?;
        }

        Ok(IgnoreRule {
            id,
            pattern: pattern.to_string(),
            subscription_id: subscription_id.map(str::to_string),
            created_at,
        })
    }

    /// Deletes an ignore rule by id.
    pub fn delete_ignore_rule(&self, id: &str) -> Result<(), AppError> {
        let mut conn = self.conn()?;

        diesel::delete(ignore_rules::table.filter(ignore_rules::id.eq(id))).execute(&mut *conn)?;

        Ok(())
    }
}

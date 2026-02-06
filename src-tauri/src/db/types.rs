//! Custom Diesel types for JSON serialization.
//!
//! Provides `JsonVec<T>` for storing `Vec<T>` as JSON text in `SQLite`.

use diesel::deserialize::{self, FromSql};
use diesel::serialize::{self, Output, ToSql};
use diesel::sql_types::Text;
use diesel::sqlite::Sqlite;
use serde::{de::DeserializeOwned, Serialize};
use std::ops::{Deref, DerefMut};

use crate::models::{Attachment, NotificationAction};

/// A wrapper for `Vec<T>` that serializes to/from JSON in a TEXT column.
///
/// This type implements Diesel's `FromSql` and `ToSql` traits to automatically
/// convert between Rust vectors and JSON strings in the database.
#[derive(Debug, Clone, Default, PartialEq, Eq, diesel::AsExpression, diesel::FromSqlRow)]
#[diesel(sql_type = Text)]
pub struct JsonVec<T>(pub Vec<T>);

impl<T> JsonVec<T> {
    /// Creates a new `JsonVec` from a vector.
    pub const fn new(vec: Vec<T>) -> Self {
        Self(vec)
    }

    /// Consumes the wrapper and returns the inner vector.
    pub fn into_inner(self) -> Vec<T> {
        self.0
    }
}

impl<T> From<Vec<T>> for JsonVec<T> {
    fn from(vec: Vec<T>) -> Self {
        Self(vec)
    }
}

impl<T> From<JsonVec<T>> for Vec<T> {
    fn from(json_vec: JsonVec<T>) -> Self {
        json_vec.0
    }
}

impl<T> Deref for JsonVec<T> {
    type Target = Vec<T>;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl<T> DerefMut for JsonVec<T> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.0
    }
}

impl<T: DeserializeOwned> FromSql<Text, Sqlite> for JsonVec<T> {
    fn from_sql(
        bytes: <Sqlite as diesel::backend::Backend>::RawValue<'_>,
    ) -> deserialize::Result<Self> {
        let s = <String as FromSql<Text, Sqlite>>::from_sql(bytes)?;
        let vec: Vec<T> = match serde_json::from_str(&s) {
            Ok(v) => v,
            Err(e) => {
                log::warn!("Failed to parse JSON from database, using empty default: {e}");
                Vec::new()
            }
        };
        Ok(Self(vec))
    }
}

impl<T: Serialize + std::fmt::Debug> ToSql<Text, Sqlite> for JsonVec<T> {
    fn to_sql<'b>(&'b self, out: &mut Output<'b, '_, Sqlite>) -> serialize::Result {
        let json = serde_json::to_string(&self.0)?;
        out.set_value(json);
        Ok(serialize::IsNull::No)
    }
}

/// Type alias for JSON-serialized string tags.
pub type JsonTags = JsonVec<String>;

/// Type alias for JSON-serialized notification actions.
pub type JsonActions = JsonVec<NotificationAction>;

/// Type alias for JSON-serialized attachments.
pub type JsonAttachments = JsonVec<Attachment>;

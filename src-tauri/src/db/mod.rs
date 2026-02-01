//! Database layer for persistent storage.
//!
//! Provides SQLite-based storage using Diesel ORM for subscriptions, notifications, and settings.
//! Uses Mutex-protected connection for thread-safe access from Tauri commands.

mod connection;
mod models;
mod queries;
mod schema;
mod types;

pub use connection::Database;

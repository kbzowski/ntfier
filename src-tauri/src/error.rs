use specta::Type;
use thiserror::Error;

#[allow(dead_code)]
#[derive(Error, Debug, Type)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(String),

    #[error("WebSocket error: {0}")]
    WebSocket(String),

    #[error("Serialization error: {0}")]
    Serialization(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Invalid URL: {0}")]
    InvalidUrl(String),

    #[error("Connection error: {0}")]
    Connection(String),

    #[error("Credential error: {0}")]
    Credential(String),
}

// Conversion from rusqlite::Error
impl From<rusqlite::Error> for AppError {
    fn from(err: rusqlite::Error) -> Self {
        AppError::Database(err.to_string())
    }
}

// Conversion from serde_json::Error
impl From<serde_json::Error> for AppError {
    fn from(err: serde_json::Error) -> Self {
        AppError::Serialization(err.to_string())
    }
}

impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

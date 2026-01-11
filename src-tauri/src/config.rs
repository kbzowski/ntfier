//! Application configuration constants.

/// WebSocket connection retry configuration.
pub mod connection {
    /// Backoff intervals in seconds for reconnection attempts.
    /// Each subsequent failed attempt uses the next interval in the array.
    pub const RETRY_BACKOFF_SECS: [u64; 4] = [5, 10, 20, 30];

    /// Maximum random jitter in seconds added to backoff intervals.
    /// Helps prevent thundering herd when multiple connections retry simultaneously.
    pub const JITTER_MAX_SECS: u64 = 3;
}

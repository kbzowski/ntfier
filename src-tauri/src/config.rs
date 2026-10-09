//! Application configuration constants.

/// WebSocket connection retry configuration.
pub mod connection {
    /// Backoff intervals in seconds for reconnection attempts.
    /// Each subsequent failed attempt uses the next interval in the array.
    pub const RETRY_BACKOFF_SECS: [u64; 4] = [5, 10, 20, 30];

    /// Maximum random jitter in seconds added to backoff intervals.
    /// Helps prevent thundering herd when multiple connections retry simultaneously.
    pub const JITTER_MAX_SECS: u64 = 3;

    /// Nothing received (message, keepalive, ping) for this long means the socket is dead.
    /// ntfy sends a keepalive every 45s by default.
    pub const READ_TIMEOUT_SECS: u64 = 120;

    /// A topic we have no access to (403) is retried this rarely.
    pub const FORBIDDEN_RETRY_SECS: u64 = 30 * 60;

    /// Catch-up messages older than this go into the list without a toast.
    pub const CATCH_UP_TOAST_MAX_AGE_SECS: i64 = 10 * 60;
}

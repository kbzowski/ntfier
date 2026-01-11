/// Database schema version. Increment when making breaking changes.
/// Used to detect incompatible schema changes that require database recreation.
pub const SCHEMA_VERSION: i32 = 1;

/// Core database schema.
/// All tables and columns needed for the application.
pub const SCHEMA: &str = r"
-- Servers table: ntfy server configurations
CREATE TABLE IF NOT EXISTS servers (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL UNIQUE,
    username TEXT,
    password TEXT,
    is_default INTEGER NOT NULL DEFAULT 0
);

-- Subscriptions table: topic subscriptions per server
CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    server_id TEXT NOT NULL,
    topic TEXT NOT NULL,
    display_name TEXT,
    muted INTEGER NOT NULL DEFAULT 0,
    last_sync INTEGER,
    FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
    UNIQUE(server_id, topic)
);

-- Notifications table: received messages
CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    subscription_id TEXT NOT NULL,
    ntfy_id TEXT,
    title TEXT,
    message TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 3,
    tags TEXT DEFAULT '[]',
    timestamp INTEGER NOT NULL,
    read INTEGER NOT NULL DEFAULT 0,
    actions TEXT DEFAULT '[]',
    attachments TEXT DEFAULT '[]',
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE
);

-- Settings table: key-value store for app settings
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Migrations tracking table
CREATE TABLE IF NOT EXISTS migrations (
    id INTEGER PRIMARY KEY,
    applied_at INTEGER NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_notifications_subscription ON notifications(subscription_id);
CREATE INDEX IF NOT EXISTS idx_notifications_timestamp ON notifications(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_notifications_ntfy_id ON notifications(ntfy_id);
CREATE INDEX IF NOT EXISTS idx_notifications_subscription_read ON notifications(subscription_id, read);
CREATE INDEX IF NOT EXISTS idx_subscriptions_server ON subscriptions(server_id);
CREATE INDEX IF NOT EXISTS idx_servers_default ON servers(is_default);
";

/// Database migrations.
/// Each migration is applied once and tracked in the migrations table.
/// Migrations should be additive - never modify existing migrations.
pub const MIGRATIONS: &[&str] = &[];

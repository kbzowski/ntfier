pub const SCHEMA: &str = r#"
-- Servers table
CREATE TABLE IF NOT EXISTS servers (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL UNIQUE,
    username TEXT,
    password TEXT,
    is_default INTEGER NOT NULL DEFAULT 0
);

-- Subscriptions table
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

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    subscription_id TEXT NOT NULL,
    ntfy_id TEXT,
    title TEXT,
    message TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 3,
    tags TEXT,
    timestamp INTEGER NOT NULL,
    read INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE
);

-- Settings (key-value store)
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_notifications_subscription ON notifications(subscription_id);
CREATE INDEX IF NOT EXISTS idx_notifications_timestamp ON notifications(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_subscriptions_server ON subscriptions(server_id);
"#;

pub const MIGRATIONS: &[&str] = &[
    // Migration 1: Add last_sync to subscriptions (may already exist from schema)
    "ALTER TABLE subscriptions ADD COLUMN last_sync INTEGER;",
    // Migration 2: Add ntfy_id to notifications for deduplication (may already exist from schema)
    "ALTER TABLE notifications ADD COLUMN ntfy_id TEXT;",
    // Migration 3: Add index for ntfy_id (safe to run after column exists)
    "CREATE INDEX IF NOT EXISTS idx_notifications_ntfy_id ON notifications(ntfy_id);",
    // Migration 4: Add actions column (JSON array of NotificationAction)
    "ALTER TABLE notifications ADD COLUMN actions TEXT DEFAULT '[]';",
    // Migration 5: Add attachments column (JSON array of Attachment)
    "ALTER TABLE notifications ADD COLUMN attachments TEXT DEFAULT '[]';",
];

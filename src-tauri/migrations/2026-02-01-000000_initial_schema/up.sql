-- Servers table: ntfy server configurations
CREATE TABLE servers (
    id TEXT PRIMARY KEY NOT NULL,
    url TEXT NOT NULL UNIQUE,
    username TEXT,
    password TEXT,
    is_default INTEGER NOT NULL DEFAULT 0
);

-- Subscriptions table: topic subscriptions per server
CREATE TABLE subscriptions (
    id TEXT PRIMARY KEY NOT NULL,
    server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    topic TEXT NOT NULL,
    display_name TEXT,
    muted INTEGER NOT NULL DEFAULT 0,
    last_sync BIGINT,
    UNIQUE(server_id, topic)
);

-- Notifications table: received messages
CREATE TABLE notifications (
    id TEXT PRIMARY KEY NOT NULL,
    subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    ntfy_id TEXT,
    title TEXT,
    message TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 3,
    tags TEXT NOT NULL DEFAULT '[]',
    timestamp BIGINT NOT NULL,
    read INTEGER NOT NULL DEFAULT 0,
    actions TEXT NOT NULL DEFAULT '[]',
    attachments TEXT NOT NULL DEFAULT '[]',
    is_expanded INTEGER NOT NULL DEFAULT 0
);

-- Settings table: key-value store for app settings
CREATE TABLE settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
);

-- Indexes for query optimization
CREATE INDEX idx_notifications_subscription ON notifications(subscription_id);
CREATE INDEX idx_notifications_timestamp ON notifications(timestamp DESC);
CREATE INDEX idx_notifications_read ON notifications(read);
CREATE INDEX idx_notifications_ntfy_id ON notifications(ntfy_id);
CREATE INDEX idx_notifications_subscription_read ON notifications(subscription_id, read);
CREATE INDEX idx_subscriptions_server ON subscriptions(server_id);
CREATE INDEX idx_servers_default ON servers(is_default);

CREATE TABLE ignore_rules (
    id TEXT PRIMARY KEY NOT NULL,
    pattern TEXT NOT NULL,
    subscription_id TEXT REFERENCES subscriptions(id) ON DELETE CASCADE,
    created_at BIGINT NOT NULL
);

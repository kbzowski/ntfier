-- Cursor: time (ntfy seconds) of the newest stored message, never the clock
ALTER TABLE subscriptions RENAME COLUMN last_sync TO last_message_time;
UPDATE subscriptions SET last_message_time = (
    SELECT MAX(n.timestamp) / 1000 FROM notifications n WHERE n.subscription_id = subscriptions.id
);

-- One row per ntfy message: keep the oldest copy with its read/favorite state
DELETE FROM notifications
WHERE ntfy_id IS NOT NULL
  AND rowid NOT IN (SELECT MIN(rowid) FROM notifications WHERE ntfy_id IS NOT NULL GROUP BY ntfy_id);
DROP INDEX idx_notifications_ntfy_id;
CREATE UNIQUE INDEX idx_notifications_ntfy_id ON notifications(ntfy_id);

-- Tombstones: deleted rows stay hidden so a replay can't bring them back
ALTER TABLE notifications ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0;

DELETE FROM notifications WHERE deleted = 1;
ALTER TABLE notifications DROP COLUMN deleted;
DROP INDEX idx_notifications_ntfy_id;
CREATE INDEX idx_notifications_ntfy_id ON notifications(ntfy_id);
ALTER TABLE subscriptions RENAME COLUMN last_message_time TO last_sync;

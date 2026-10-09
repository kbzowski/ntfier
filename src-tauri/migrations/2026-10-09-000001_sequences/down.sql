DROP INDEX idx_notifications_sequence;
ALTER TABLE notifications DROP COLUMN superseded;
ALTER TABLE notifications DROP COLUMN sequence_id;

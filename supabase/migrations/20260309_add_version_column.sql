-- Add version counter for conflict detection
ALTER TABLE notes_metadata ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

-- Index for efficient pull queries
CREATE INDEX IF NOT EXISTS idx_notes_metadata_user_updated
  ON notes_metadata(user_id, updated_at DESC);

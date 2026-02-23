-- Notes metadata table for Boojy Notes cloud sync
-- Content is stored in Cloudflare R2; this table tracks metadata only.

CREATE TABLE IF NOT EXISTS notes_metadata (
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note_id    TEXT        NOT NULL,
  title      TEXT        NOT NULL DEFAULT 'Untitled',
  content_hash TEXT,
  size_bytes INTEGER     NOT NULL DEFAULT 0,
  r2_key     TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted    BOOLEAN     NOT NULL DEFAULT FALSE,

  PRIMARY KEY (user_id, note_id)
);

-- Index for efficient pull queries (filter by user + updated_at)
CREATE INDEX IF NOT EXISTS idx_notes_metadata_user_updated
  ON notes_metadata (user_id, updated_at DESC);

-- Row Level Security: users can only access their own notes
ALTER TABLE notes_metadata ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own notes"
  ON notes_metadata FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own notes"
  ON notes_metadata FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own notes"
  ON notes_metadata FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own notes"
  ON notes_metadata FOR DELETE
  USING (auth.uid() = user_id);

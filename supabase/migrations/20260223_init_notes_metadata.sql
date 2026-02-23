-- Notes metadata table for Boojy Notes cloud sync
-- Content is stored in Cloudflare R2; this table tracks metadata only.

CREATE TABLE notes_metadata (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note_id TEXT NOT NULL,
  title TEXT,
  content_hash TEXT,
  size_bytes INTEGER DEFAULT 0,
  r2_key TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  deleted BOOLEAN DEFAULT false,
  UNIQUE(user_id, note_id)
);

CREATE INDEX idx_notes_metadata_user ON notes_metadata(user_id);

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

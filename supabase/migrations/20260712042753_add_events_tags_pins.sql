/*
# V3 Family Feed — Events, Tags, Pin

1. New Tables
   - `events` — family events with RSVP
     - id, title, description, event_date, location, author, rsvps (jsonb), created_at

2. Modified Tables
   - `posts`: add `tags` (text[], category labels) + `pinned` (boolean) columns

3. Security
   - RLS enabled on events; all policies scoped TO authenticated
*/

-- Events
CREATE TABLE IF NOT EXISTS events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  description text DEFAULT '',
  event_date timestamptz NOT NULL,
  location text DEFAULT '',
  author text NOT NULL,
  rsvps jsonb DEFAULT '{"yes":[],"no":[],"maybe":[]}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "events_select" ON events;
CREATE POLICY "events_select" ON events FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "events_insert" ON events;
CREATE POLICY "events_insert" ON events FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "events_update" ON events;
CREATE POLICY "events_update" ON events FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "events_delete" ON events;
CREATE POLICY "events_delete" ON events FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date);

-- Posts: add tags and pinned columns
ALTER TABLE posts ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS pinned boolean DEFAULT false;

/*
# V3 Family Feed - Full Schema

1. New Tables
   - `posts` - main feed posts
     - `id` (uuid, primary key)
     - `author` (text) - email of the poster
     - `content` (text) - post text body
     - `image_url` (text, nullable) - optional attached image
     - `reactions` (jsonb) - { like: [email,...], love: [email,...], laugh: [email,...] }
     - `created_at` (timestamptz)
   - `replies` - comments on posts
     - `id` (uuid, primary key)
     - `post_id` (uuid) - references posts
     - `author` (text) - email
     - `content` (text)
     - `created_at` (timestamptz)
   - `stories` - 24-hour ephemeral stories
     - `id` (uuid, primary key)
     - `author` (text) - email
     - `image_url` (text) - required image
     - `caption` (text, nullable)
     - `created_at` (timestamptz)
     - `expires_at` (timestamptz) - auto 24h expiry

2. Security
   - RLS enabled on all tables
   - All policies scoped TO authenticated (app has sign-in)
   - Author is email-based so policies are permissive for authenticated users
*/

-- Posts
CREATE TABLE IF NOT EXISTS posts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  author text NOT NULL,
  content text NOT NULL DEFAULT '',
  image_url text,
  reactions jsonb DEFAULT '{"like":[],"love":[],"laugh":[]}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "posts_select" ON posts;
CREATE POLICY "posts_select" ON posts FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "posts_insert" ON posts;
CREATE POLICY "posts_insert" ON posts FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "posts_update" ON posts;
CREATE POLICY "posts_update" ON posts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "posts_delete" ON posts;
CREATE POLICY "posts_delete" ON posts FOR DELETE TO authenticated USING (true);

-- Replies
CREATE TABLE IF NOT EXISTS replies (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id uuid REFERENCES posts(id) ON DELETE CASCADE,
  author text NOT NULL,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE replies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "replies_select" ON replies;
CREATE POLICY "replies_select" ON replies FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "replies_insert" ON replies;
CREATE POLICY "replies_insert" ON replies FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "replies_delete" ON replies;
CREATE POLICY "replies_delete" ON replies FOR DELETE TO authenticated USING (true);

-- Stories
CREATE TABLE IF NOT EXISTS stories (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  author text NOT NULL,
  image_url text NOT NULL,
  caption text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT now() + interval '24 hours'
);

ALTER TABLE stories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stories_select" ON stories;
CREATE POLICY "stories_select" ON stories FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "stories_insert" ON stories;
CREATE POLICY "stories_insert" ON stories FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "stories_update" ON stories;
CREATE POLICY "stories_update" ON stories FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "stories_delete" ON stories;
CREATE POLICY "stories_delete" ON stories FOR DELETE TO authenticated USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_replies_post_id ON replies(post_id);
CREATE INDEX IF NOT EXISTS idx_stories_expires_at ON stories(expires_at);

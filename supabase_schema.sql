-- =============================================
-- MindForge — Supabase Database Schema
-- Copy-paste this into Supabase SQL Editor and run
-- =============================================

-- 1. Events table: tracks app/website usage
CREATE TABLE IF NOT EXISTS events (
  id BIGSERIAL PRIMARY KEY,
  timestamp BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  source TEXT,
  app TEXT,
  url TEXT,
  category TEXT,
  is_idle BOOLEAN DEFAULT FALSE
);

-- 2. Scores table: focus scores computed every 30s
CREATE TABLE IF NOT EXISTS scores (
  id BIGSERIAL PRIMARY KEY,
  timestamp BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  score INTEGER NOT NULL
);

-- 3. Sessions table: focus session records
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  start_time BIGINT,
  end_time BIGINT,
  goal TEXT,
  avg_score INTEGER,
  deep_work_minutes INTEGER,
  productive_sec INTEGER DEFAULT 0,
  distraction_sec INTEGER DEFAULT 0,
  browser_sec INTEGER DEFAULT 0,
  neutral_sec INTEGER DEFAULT 0,
  idle_sec INTEGER DEFAULT 0
);

-- 4. Daily habits table
CREATE TABLE IF NOT EXISTS daily_habits (
  date TEXT PRIMARY KEY,
  read_done BOOLEAN DEFAULT FALSE,
  meditation_done BOOLEAN DEFAULT FALSE,
  session_done BOOLEAN DEFAULT FALSE,
  streak_count INTEGER DEFAULT 0
);

-- 5. Deep work ramp table
CREATE TABLE IF NOT EXISTS ramp (
  id BIGSERIAL PRIMARY KEY,
  date TEXT,
  target_minutes INTEGER DEFAULT 20,
  achieved INTEGER DEFAULT 0,
  success BOOLEAN DEFAULT FALSE
);

-- =============================================
-- Analytics Tables (NEW — ML & Study Habits)
-- =============================================

-- 6. Per-tab time analytics
CREATE TABLE IF NOT EXISTS tab_analytics (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT,
  hostname TEXT,
  url TEXT,
  category TEXT,             -- productive/distraction/neutral
  content_type TEXT,         -- text/video/interactive/audio/mixed
  active_seconds INTEGER,
  timestamp BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

-- 7. Content type preference aggregates (daily)
CREATE TABLE IF NOT EXISTS content_preferences (
  id BIGSERIAL PRIMARY KEY,
  date TEXT,
  text_seconds INTEGER DEFAULT 0,
  video_seconds INTEGER DEFAULT 0,
  interactive_seconds INTEGER DEFAULT 0,
  audio_seconds INTEGER DEFAULT 0,
  total_productive_seconds INTEGER DEFAULT 0,
  total_distraction_seconds INTEGER DEFAULT 0,
  total_neutral_seconds INTEGER DEFAULT 0
);

-- =============================================
-- Indexes for performance
-- =============================================
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events (timestamp);
CREATE INDEX IF NOT EXISTS idx_scores_timestamp ON scores (timestamp);
CREATE INDEX IF NOT EXISTS idx_ramp_date ON ramp (date);
CREATE INDEX IF NOT EXISTS idx_tab_analytics_timestamp ON tab_analytics (timestamp);
CREATE INDEX IF NOT EXISTS idx_tab_analytics_category ON tab_analytics (category);
CREATE INDEX IF NOT EXISTS idx_tab_analytics_session ON tab_analytics (session_id);
CREATE INDEX IF NOT EXISTS idx_content_preferences_date ON content_preferences (date);

-- =============================================
-- Row Level Security (RLS)
-- Disable RLS for simplicity since this is a local desktop app
-- =============================================
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE ramp ENABLE ROW LEVEL SECURITY;
ALTER TABLE tab_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_preferences ENABLE ROW LEVEL SECURITY;

-- Allow public access (anon key) — needed for desktop app without auth
CREATE POLICY "Allow all on events" ON events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on scores" ON scores FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on sessions" ON sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on daily_habits" ON daily_habits FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on ramp" ON ramp FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on tab_analytics" ON tab_analytics FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on content_preferences" ON content_preferences FOR ALL USING (true) WITH CHECK (true);

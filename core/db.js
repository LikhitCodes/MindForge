const { createClient } = require('@supabase/supabase-js');

let supabase = null;
let currentUserId = null;

/**
 * Initialize Supabase client
 */
function initDB() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  if (!url || !key || url === 'your_supabase_url_here') {
    console.error('[DB] Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env');
    return false;
  }

  supabase = createClient(url, key);
  console.log('[DB] Supabase client initialized');
  return true;
}

/**
 * Re-initialize Supabase client with authenticated session.
 * This makes RLS work — the JWT carries the user's uid.
 */
function setAuthSession(accessToken, refreshToken) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  supabase = createClient(url, key, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });

  // Decode user ID from JWT payload
  try {
    const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64').toString());
    currentUserId = payload.sub || null;
    console.log(`[DB] Auth session set for user: ${currentUserId}`);
  } catch (e) {
    console.warn('[DB] Could not decode JWT:', e.message);
  }
}

/**
 * Get the current authenticated user's ID
 */
function getUserId() {
  return currentUserId;
}

/**
 * Get the Supabase client instance
 */
function getDB() {
  return supabase;
}

/**
 * Insert a tracking event
 */
async function insertEvent(source, appName, url, category, isIdle = false) {
  const { error } = await supabase.from('events').insert({
    timestamp: Date.now(),
    source,
    app: appName,
    url: url || null,
    category: category || 'neutral',
    is_idle: isIdle,
    user_id: currentUserId,
  });
  if (error) console.error('[DB] insertEvent error:', error.message);
}

/**
 * Get events from last N seconds
 */
async function getRecentEvents(seconds = 30) {
  const since = Date.now() - seconds * 1000;
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .gte('timestamp', since)
    .order('timestamp', { ascending: true });

  if (error) {
    console.error('[DB] getRecentEvents error:', error.message);
    return [];
  }
  return data || [];
}

/**
 * Insert a computed focus score
 */
async function insertScore(score) {
  const { error } = await supabase.from('scores').insert({
    timestamp: Date.now(),
    score,
    user_id: currentUserId,
  });
  if (error) console.error('[DB] insertScore error:', error.message);
}

/**
 * Get heatmap data: avg focus score grouped by day-of-week and hour
 * Since Supabase doesn't support complex aggregation easily,
 * we pull raw scores and aggregate in JS
 */
async function getHeatmapData() {
  // Get scores from last 7 days
  const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const { data, error } = await supabase
    .from('scores')
    .select('timestamp, score')
    .gte('timestamp', since)
    .order('timestamp', { ascending: true });

  if (error) {
    console.error('[DB] getHeatmapData error:', error.message);
    return [];
  }

  // Group by day-of-week (0=Sun..6=Sat) and hour (0-23)
  const buckets = {};
  (data || []).forEach((row) => {
    const d = new Date(row.timestamp);
    const day = d.getDay(); // 0=Sun
    const hour = d.getHours();
    const key = `${day}-${hour}`;
    if (!buckets[key]) buckets[key] = { day, hour, scores: [] };
    buckets[key].scores.push(row.score);
  });

  return Object.values(buckets).map((b) => ({
    day: b.day,
    hour: b.hour,
    avg_score: Math.round(b.scores.reduce((a, c) => a + c, 0) / b.scores.length),
  }));
}

/**
 * Get deep work ramp data
 */
async function getDeepWorkRamp() {
  const today = new Date().toISOString().slice(0, 10);

  // Get today's ramp
  const { data: todayRamp } = await supabase
    .from('ramp')
    .select('*')
    .eq('date', today)
    .single();

  // Get last 7 days history
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data: history } = await supabase
    .from('ramp')
    .select('*')
    .gte('date', weekAgo)
    .order('date', { ascending: true });

  return {
    current_target: todayRamp?.target_minutes || 20,
    today_best: todayRamp?.achieved || 0,
    history: history || [],
  };
}

/**
 * Get focus debt in minutes
 */
async function getFocusDebt() {
  // Debt = sum of interrupted session minutes from yesterday
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const startOfYesterday = new Date(yesterday).getTime();
  const endOfYesterday = startOfYesterday + 24 * 60 * 60 * 1000;

  const { data } = await supabase
    .from('sessions')
    .select('deep_work_minutes, avg_score')
    .gte('start_time', startOfYesterday)
    .lt('start_time', endOfYesterday);

  let debtMinutes = 0;
  (data || []).forEach((s) => {
    if (s.avg_score < 50) {
      debtMinutes += Math.max(0, 30 - (s.deep_work_minutes || 0));
    }
  });

  return { debt_minutes: debtMinutes };
}

/**
 * Get daily habits for a specific date
 */
async function getDailyHabits(date) {
  const { data, error } = await supabase
    .from('daily_habits')
    .select('*')
    .eq('date', date)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('[DB] getDailyHabits error:', error.message);
  }

  return data || {
    date,
    read_done: false,
    meditation_done: false,
    session_done: false,
    streak_count: 0,
  };
}

/**
 * Update a habit completion status
 */
async function updateHabit(date, habit, done) {
  const columnMap = {
    read: 'read_done',
    meditation: 'meditation_done',
    session: 'session_done',
  };
  const column = columnMap[habit];
  if (!column) return;

  // Upsert: insert if not exists, update if exists
  const existing = await getDailyHabits(date);
  const updateData = { ...existing, date, [column]: done };

  const { error } = await supabase
    .from('daily_habits')
    .upsert(updateData, { onConflict: 'date' });

  if (error) console.error('[DB] updateHabit error:', error.message);

  // Update streak
  await updateStreak(date);
}

/**
 * Calculate and update streak count
 */
async function updateStreak(date) {
  let streak = 0;
  let checkDate = new Date(date);

  while (true) {
    const dateStr = checkDate.toISOString().slice(0, 10);
    const { data } = await supabase
      .from('daily_habits')
      .select('read_done, meditation_done, session_done')
      .eq('date', dateStr)
      .single();

    if (data && data.read_done && data.meditation_done && data.session_done) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  await supabase
    .from('daily_habits')
    .update({ streak_count: streak })
    .eq('date', date);
}

// ═══════════════════════════════════════
//  ANALYTICS FUNCTIONS (NEW)
// ═══════════════════════════════════════

/**
 * Batch insert per-tab analytics data
 */
async function insertTabAnalytics(entries) {
  if (!supabase || !entries || entries.length === 0) return;

  const { error } = await supabase.from('tab_analytics').insert(entries);
  if (error) console.error('[DB] insertTabAnalytics error:', error.message);
}

/**
 * Get content type preferences for the last N days
 */
async function getContentPreferences(days = 7) {
  if (!supabase) return { text: 0, video: 0, interactive: 0, audio: 0 };

  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const { data, error } = await supabase
    .from('tab_analytics')
    .select('content_type, active_seconds')
    .gte('timestamp', since);

  if (error) {
    console.error('[DB] getContentPreferences error:', error.message);
    return { text: 0, video: 0, interactive: 0, audio: 0 };
  }

  const prefs = { text: 0, video: 0, interactive: 0, audio: 0 };
  (data || []).forEach(row => {
    const ct = row.content_type || 'text';
    prefs[ct] = (prefs[ct] || 0) + (row.active_seconds || 0);
  });

  return prefs;
}

/**
 * Get time breakdown by category for the last N days
 */
async function getTimeBreakdownDB(days = 7) {
  if (!supabase) return { productive: 0, distraction: 0, neutral: 0 };

  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const { data, error } = await supabase
    .from('tab_analytics')
    .select('category, active_seconds')
    .gte('timestamp', since);

  if (error) {
    console.error('[DB] getTimeBreakdownDB error:', error.message);
    return { productive: 0, distraction: 0, neutral: 0 };
  }

  const breakdown = { productive: 0, distraction: 0, neutral: 0 };
  (data || []).forEach(row => {
    const cat = row.category || 'neutral';
    breakdown[cat] = (breakdown[cat] || 0) + (row.active_seconds || 0);
  });

  return breakdown;
}

/**
 * Get study habit insights
 * Returns: preferred content type, peak study hours, avg session patterns
 */
async function getStudyHabits() {
  if (!supabase) return { preferredFormat: 'text', peakHours: [], avgSessionMinutes: 0 };

  // Content type preferences
  const prefs = await getContentPreferences(30); // Last 30 days
  const preferredFormat = Object.entries(prefs)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'text';

  // Peak study hours from productive tab analytics
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const { data: productiveData } = await supabase
    .from('tab_analytics')
    .select('timestamp, active_seconds')
    .eq('category', 'productive')
    .gte('timestamp', thirtyDaysAgo);

  // Group by hour
  const hourBuckets = {};
  (productiveData || []).forEach(row => {
    const hour = new Date(row.timestamp).getHours();
    hourBuckets[hour] = (hourBuckets[hour] || 0) + (row.active_seconds || 0);
  });

  const peakHours = Object.entries(hourBuckets)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([hour, seconds]) => ({ hour: parseInt(hour), seconds }));

  // Average session duration
  const { data: sessions } = await supabase
    .from('sessions')
    .select('deep_work_minutes')
    .gte('start_time', thirtyDaysAgo);

  const totalMinutes = (sessions || []).reduce((sum, s) => sum + (s.deep_work_minutes || 0), 0);
  const avgSessionMinutes = sessions && sessions.length > 0
    ? Math.round(totalMinutes / sessions.length) : 0;

  return {
    preferredFormat,
    contentBreakdown: prefs,
    peakHours,
    avgSessionMinutes,
    totalSessions: (sessions || []).length,
  };
}
// ═══════════════════════════════════════
//  SESSION SITES FUNCTIONS (Extension Browser Data)
// ═══════════════════════════════════════

/**
 * Batch insert per-site browser analytics linked to a session.
 * Called when a session ends, from the browserTabs accumulator.
 * @param {string} sessionId
 * @param {Array} sites - [{hostname, category, contentType, active_seconds, visits}]
 * @param {string} date - YYYY-MM-DD
 */
async function insertSessionSites(sessionId, sites, date) {
  if (!supabase || !sessionId || !sites || sites.length === 0) return;

  const rows = sites.map(site => ({
    session_id: sessionId,
    hostname: site.hostname,
    category: site.category || 'neutral',
    content_type: site.contentType || site.content_type || 'text',
    active_seconds: site.active_seconds || 0,
    visits: site.visits || 1,
    date: date || new Date().toISOString().slice(0, 10),
    timestamp: Date.now(),
  }));

  const { error } = await supabase.from('session_sites').insert(rows);
  if (error) console.error('[DB] insertSessionSites error:', error.message);
  else console.log(`[DB] Inserted ${rows.length} session_sites rows for session ${sessionId.slice(0, 8)}`);
}

/**
 * Get per-site analytics aggregated across all sessions for the last N days.
 * Returns sites sorted by total time spent (descending) — for "Top Time Sinks" chart.
 * @param {number} days
 * @param {string} [category] - optional filter: 'productive' | 'distraction' | 'neutral'
 */
async function getPerSiteAnalytics(days = 7, category = null) {
  if (!supabase) return [];

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  let query = supabase
    .from('session_sites')
    .select('hostname, category, content_type, active_seconds, visits')
    .gte('date', since);

  if (category) {
    query = query.eq('category', category);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[DB] getPerSiteAnalytics error:', error.message);
    return [];
  }

  // Aggregate by hostname
  const siteMap = {};
  (data || []).forEach(row => {
    const key = row.hostname;
    if (!siteMap[key]) {
      siteMap[key] = {
        hostname: key,
        category: row.category,
        content_type: row.content_type,
        total_seconds: 0,
        total_visits: 0,
      };
    }
    siteMap[key].total_seconds += row.active_seconds || 0;
    siteMap[key].total_visits += row.visits || 1;
    // Use most recent classification (last write wins per aggregation)
    siteMap[key].category = row.category;
    siteMap[key].content_type = row.content_type;
  });

  return Object.values(siteMap).sort((a, b) => b.total_seconds - a.total_seconds);
}

/**
 * Get per-site breakdown for a specific session.
 * @param {string} sessionId
 */
async function getSessionSites(sessionId) {
  if (!supabase || !sessionId) return [];

  const { data, error } = await supabase
    .from('session_sites')
    .select('*')
    .eq('session_id', sessionId)
    .order('active_seconds', { ascending: false });

  if (error) {
    console.error('[DB] getSessionSites error:', error.message);
    return [];
  }
  return data || [];
}

/**
 * Get analytics data for a given range (week or month)
 */
async function getAnalyticsData(range = 'week') {
  const days = range === 'month' ? 30 : 7;
  const since = Date.now() - days * 24 * 60 * 60 * 1000;

  // Get sessions
  const { data: sessions } = await supabase
    .from('sessions')
    .select('*')
    .gte('start_time', since)
    .order('start_time', { ascending: true });

  // Get scores
  const { data: scores } = await supabase
    .from('scores')
    .select('timestamp, score')
    .gte('timestamp', since)
    .order('timestamp', { ascending: true });

  // Get streaks
  const { data: habits } = await supabase
    .from('daily_habits')
    .select('*')
    .order('date', { ascending: false })
    .limit(days);

  // Aggregate daily stats
  const dailyMap = {};
  (sessions || []).forEach((s) => {
    const day = new Date(s.start_time).toISOString().slice(0, 10);
    if (!dailyMap[day]) dailyMap[day] = { deepWork: 0, sessions: 0, totalScore: 0, scoreCount: 0 };
    dailyMap[day].deepWork += s.deep_work_minutes || 0;
    dailyMap[day].sessions += 1;
    if (s.avg_score) {
      dailyMap[day].totalScore += s.avg_score;
      dailyMap[day].scoreCount += 1;
    }
  });

  const dailyStats = Object.entries(dailyMap).map(([date, d]) => ({
    date,
    deepWork: d.deepWork,
    sessions: d.sessions,
    avgScore: d.scoreCount > 0 ? Math.round(d.totalScore / d.scoreCount) : 0,
  }));

  // Hourly productivity (from scores)
  const hourlyMap = {};
  (scores || []).forEach((s) => {
    const hour = new Date(s.timestamp).getHours();
    if (!hourlyMap[hour]) hourlyMap[hour] = { total: 0, count: 0 };
    hourlyMap[hour].total += s.score;
    hourlyMap[hour].count += 1;
  });

  const bestHours = Object.entries(hourlyMap)
    .map(([hour, d]) => ({ hour: parseInt(hour), avgScore: Math.round(d.total / d.count) }))
    .sort((a, b) => b.avgScore - a.avgScore);

  // Overall stats
  const totalDeepWork = (sessions || []).reduce((sum, s) => sum + (s.deep_work_minutes || 0), 0);
  const allScores = (sessions || []).filter(s => s.avg_score).map(s => s.avg_score);
  const avgScore = allScores.length > 0 ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length) : 0;
  const currentStreak = habits && habits.length > 0 ? (habits[0].streak_count || 0) : 0;

  // Best day
  let bestDay = null;
  dailyStats.forEach(d => {
    if (!bestDay || d.deepWork > bestDay.deepWork) bestDay = d;
  });

  return {
    dailyStats,
    bestHours,
    totalDeepWork,
    avgScore,
    totalSessions: (sessions || []).length,
    currentStreak,
    bestDay: bestDay ? bestDay.date : null,
  };
}

/**
 * Get today's summary
 */
async function getTodaySummary() {
  const today = new Date().toISOString().slice(0, 10);
  const startOfDay = new Date(today).getTime();
  const endOfDay = startOfDay + 24 * 60 * 60 * 1000;

  // Today's sessions
  const { data: sessions } = await supabase
    .from('sessions')
    .select('*')
    .gte('start_time', startOfDay)
    .lt('start_time', endOfDay);

  // Today's habits
  const habits = await getDailyHabits(today);

  const totalSessions = (sessions || []).length;
  const totalDeepWork = (sessions || []).reduce((sum, s) => sum + (s.deep_work_minutes || 0), 0);
  const allScores = (sessions || []).filter(s => s.avg_score).map(s => s.avg_score);
  const avgScore = allScores.length > 0 ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length) : 0;

  const habitsCompleted = [habits.read_done, habits.meditation_done, habits.session_done].filter(Boolean).length;

  return {
    totalSessions,
    totalDeepWork,
    avgScore,
    habitsCompleted,
    habitsTotal: 3,
    streak: habits.streak_count || 0,
  };
}

// ═══════════════════════════════════════
//  FOCUS ROOM FUNCTIONS
// ═══════════════════════════════════════

/**
 * Create a focus room
 */
async function createRoom(roomId, name) {
  if (!supabase) return { error: 'DB not ready' };

  const { data, error } = await supabase.from('focus_rooms').insert({
    id: roomId,
    name,
    created_by: currentUserId,
    created_at: Date.now(),
  }).select().single();

  if (error) {
    console.error('[DB] createRoom error:', error.message);
    return { error: error.message };
  }
  return { data };
}

/**
 * Get room by code
 */
async function getRoomByCode(code) {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('focus_rooms')
    .select('*')
    .eq('id', code)
    .single();

  if (error) {
    if (error.code !== 'PGRST116') console.error('[DB] getRoomByCode error:', error.message);
    return null;
  }
  return data;
}

/**
 * Join a room
 */
async function joinRoom(roomId, displayName) {
  if (!supabase) return { error: 'DB not ready' };

  const { data, error } = await supabase.from('focus_room_members').upsert({
    room_id: roomId,
    user_id: currentUserId,
    display_name: displayName,
    status: 'focused',
    score: 0,
    joined_at: Date.now(),
  }, { onConflict: 'room_id,user_id' }).select().single();

  if (error) {
    console.error('[DB] joinRoom error:', error.message);
    return { error: error.message };
  }
  return { data };
}

/**
 * Leave a room
 */
async function leaveRoom(roomId) {
  if (!supabase) return { error: 'DB not ready' };

  const { error } = await supabase
    .from('focus_room_members')
    .delete()
    .eq('room_id', roomId)
    .eq('user_id', currentUserId);

  if (error) {
    console.error('[DB] leaveRoom error:', error.message);
    return { error: error.message };
  }
  return { ok: true };
}

/**
 * Get all members of a room
 */
async function getRoomMembers(roomId) {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('focus_room_members')
    .select('*')
    .eq('room_id', roomId)
    .order('joined_at', { ascending: true });

  if (error) {
    console.error('[DB] getRoomMembers error:', error.message);
    return [];
  }
  return data || [];
}

/**
 * Update a member's focus status and score
 */
async function updateMemberStatus(roomId, status, score) {
  if (!supabase || !currentUserId) return;

  const { error } = await supabase
    .from('focus_room_members')
    .update({ status, score })
    .eq('room_id', roomId)
    .eq('user_id', currentUserId);

  if (error) {
    console.error('[DB] updateMemberStatus error:', error.message);
  }
}

/**
 * Get the room the current user is in (if any)
 */
async function getUserActiveRoom() {
  if (!supabase || !currentUserId) return null;

  const { data, error } = await supabase
    .from('focus_room_members')
    .select('room_id')
    .eq('user_id', currentUserId)
    .limit(1)
    .single();

  if (error) return null;
  return data?.room_id || null;
}

module.exports = {
  initDB,
  getDB,
  setAuthSession,
  getUserId,
  insertEvent,
  getRecentEvents,
  insertScore,
  getHeatmapData,
  getDeepWorkRamp,
  getFocusDebt,
  getDailyHabits,
  updateHabit,
  insertTabAnalytics,
  getContentPreferences,
  getTimeBreakdownDB,
  getStudyHabits,
  getAnalyticsData,
  getTodaySummary,
  insertSessionSites,
  getPerSiteAnalytics,
  getSessionSites,
  // Focus Rooms
  createRoom,
  getRoomByCode,
  joinRoom,
  leaveRoom,
  getRoomMembers,
  updateMemberStatus,
  getUserActiveRoom,
};

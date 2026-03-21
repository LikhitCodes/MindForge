const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const {
  insertEvent,
  getHeatmapData,
  getDeepWorkRamp,
  getFocusDebt,
  getDailyHabits,
  updateHabit,
  getDB,
  insertTabAnalytics,
  getContentPreferences,
  getTimeBreakdownDB,
  getStudyHabits,
  getAnalyticsData,
  getTodaySummary,
} = require('./db');
const { startScorer } = require('./scorer');
const session = require('./session');

const PORT = 39871;
let wss = null;

/**
 * Broadcast to all WebSocket clients
 */
function broadcast(data) {
  if (!wss) return;
  const msg = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) client.send(msg);
  });
}

/**
 * Start Express + WebSocket server
 */
function startServer() {
  return new Promise((resolve, reject) => {
    const app = express();
    app.use(express.json());

    // CORS
    app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      if (req.method === 'OPTIONS') return res.sendStatus(200);
      next();
    });

    // ─── Health check ───
    app.get('/ping', (req, res) => {
      res.json({ status: 'alive', version: '1.0.0' });
    });

    // ─── AI Validation (Groq) ───
    app.post('/ai-validate', async (req, res) => {
      const { appName } = req.body;
      if (!appName) return res.status(400).json({ error: 'AppName is required' });
      
      try {
        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) {
          console.warn('[Server] No GROQ_API_KEY found. Defaulting to true for hackathon testing.');
          return res.json({ isProductive: true, reason: 'AI disabled' });
        }

        const prompt = `You are a focus coach AI inside the MindForge app.
The user wants to add an application to their "Allowed/Productive Apps" list.
App Name: "${appName}"
Is this application genuinely productive for focused studying/working, or is it typically a distraction (like games, social media, Netflix)?
Reply strictly with a JSON object in this exact format:
{"isProductive": true, "reason": "brief 1 sentence reason"}
or
{"isProductive": false, "reason": "brief 1 sentence reason"}`;

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'llama-3.1-8b-instant',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.1
          })
        });

        if (!response.ok) {
           const errText = await response.text();
           throw new Error(`Groq API error: ${response.status} ${errText}`);
        }

        const data = await response.json();
        let content = data.choices[0].message.content;
        
        // Safely extract JSON from markdown if model wrapped it
        const jsonStart = content.indexOf('{');
        const jsonEnd = content.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1) {
          content = content.substring(jsonStart, jsonEnd + 1);
        }
        
        const parsed = JSON.parse(content);
        
        console.log(`[AI] Validated "${appName}": Productive=${parsed.isProductive} — ${parsed.reason}`);
        res.json(parsed);
      } catch (err) {
        console.error('[Server] AI validation error:', err.message);
        // Fallback to allow if API fails
        res.json({ isProductive: true, reason: 'AI fallback allowed' });
      }
    });

    // ═══════════════════════════════════════════
    //  SESSION ENDPOINTS (NEW)
    // ═══════════════════════════════════════════

    // Start a focus session
    app.post('/session/start', (req, res) => {
      const { goal, mode, allowedApps } = req.body;
      const info = session.startSession(goal || 'Focus Session', mode || 'basic', allowedApps || []);

      // Broadcast to UI
      broadcast({ type: 'session_started', ...info });
      res.json({ ok: true, session: info });
    });

    // End the current session → push summary to Supabase
    app.post('/session/end', async (req, res) => {
      const summary = session.endSession();
      if (!summary) {
        return res.json({ ok: false, error: 'No active session' });
      }

      // Push session summary to Supabase
      try {
        const supabase = getDB();
        if (supabase) {
          await supabase.from('sessions').upsert({
            id: summary.id,
            start_time: summary.start_time,
            end_time: summary.end_time,
            goal: summary.goal,
            avg_score: summary.avg_score,
            deep_work_minutes: summary.deep_work_minutes,
            productive_sec: summary.breakdown.productive,
            distraction_sec: summary.breakdown.distraction,
            browser_sec: summary.breakdown.browser,
            neutral_sec: summary.breakdown.neutral,
            idle_sec: summary.breakdown.idle,
          });

          // Also push the final score
          await supabase.from('scores').insert({
            timestamp: Date.now(),
            score: summary.avg_score,
          });

          console.log('[Server] Session summary saved to Supabase');
        }
      } catch (err) {
        console.error('[Server] Error saving session to Supabase:', err.message);
      }

      // Broadcast to UI
      broadcast({ type: 'session_ended', summary });
      res.json({ ok: true, summary });
    });

    // Get session status
    app.get('/session/status', (req, res) => {
      res.json(session.getStatus());
    });

    // ═══════════════════════════════════════════
    //  DATA ENDPOINTS (Supabase)
    // ═══════════════════════════════════════════

    app.post('/browser-event', async (req, res) => {
      try {
        const { url, category, contentType } = req.body;
        // During active session, add to session memory
        if (session.isActive()) {
          session.addEvent('chrome', 'Chrome', url, category || 'browser', false, contentType || 'text');
        }
        res.json({ ok: true });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // ═══════════════════════════════════════════
    //  ANALYTICS ENDPOINTS (NEW)
    // ═══════════════════════════════════════════

    // Receive per-tab time analytics from extension
    app.post('/analytics/tab-time', async (req, res) => {
      try {
        const { timeBreakdown, perSite, timestamp } = req.body;
        const sessionId = session.isActive() ? session.getStatus().id : null;

        // Store per-site data
        if (perSite && perSite.length > 0) {
          await insertTabAnalytics(perSite.map(site => ({
            session_id: sessionId,
            hostname: site.hostname,
            url: '',
            category: site.category,
            content_type: site.contentType,
            active_seconds: site.totalSeconds,
            timestamp: timestamp || Date.now(),
          })));
        }

        res.json({ ok: true });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Get content type preferences
    app.get('/analytics/content-preferences', async (req, res) => {
      try {
        const days = parseInt(req.query.days) || 7;
        const data = await getContentPreferences(days);
        res.json(data);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Get time breakdown (productive/distraction/neutral)
    app.get('/analytics/time-breakdown', async (req, res) => {
      try {
        const days = parseInt(req.query.days) || 7;
        const data = await getTimeBreakdownDB(days);
        res.json(data);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Get study habit insights
    app.get('/analytics/study-habits', async (req, res) => {
      try {
        const data = await getStudyHabits();
        res.json(data);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.post('/habit-complete', async (req, res) => {
      try {
        const { habit } = req.body;
        const today = new Date().toISOString().slice(0, 10);
        await updateHabit(today, habit, true);
        res.json({ ok: true });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.get('/scores/heatmap', async (req, res) => {
      try {
        const data = await getHeatmapData();
        res.json(data);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.get('/ramp', async (req, res) => {
      try {
        const data = await getDeepWorkRamp();
        res.json(data);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.get('/debt', async (req, res) => {
      try {
        const data = await getFocusDebt();
        res.json(data);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.get('/habits', async (req, res) => {
      try {
        const date = req.query.date || new Date().toISOString().slice(0, 10);
        const data = await getDailyHabits(date);
        res.json(data);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // ─── Analytics ───
    app.get('/analytics', async (req, res) => {
      try {
        const range = req.query.range || 'week';
        const data = await getAnalyticsData(range);
        res.json(data);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // ─── Today Summary ───
    app.get('/summary/today', async (req, res) => {
      try {
        const data = await getTodaySummary();
        res.json(data);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // ─── HTTP + WebSocket server ───
    const server = http.createServer(app);
    wss = new WebSocketServer({ server });

    wss.on('connection', (ws) => {
      console.log('[WS] Client connected');

      // Send current session status on connect
      ws.send(JSON.stringify({ type: 'session_status', ...session.getStatus() }));

      ws.on('close', () => console.log('[WS] Client disconnected'));
      ws.on('error', (err) => console.error('[WS] Error:', err.message));
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') reject(new Error(`Port ${PORT} is already in use`));
      else reject(err);
    });

    server.listen(PORT, () => {
      console.log(`[Server] Express + WS on port ${PORT}`);
      startScorer(broadcast);
      resolve();
    });
  });
}

module.exports = { startServer, broadcast };

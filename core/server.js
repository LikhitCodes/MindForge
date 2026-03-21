const express = require('express');
const http = require('http');
const os = require('os');
const { WebSocketServer } = require('ws');
const {
  insertEvent,
  getHeatmapData,
  getDeepWorkRamp,
  getFocusDebt,
  getDailyHabits,
  updateHabit,
  getDB,
  getUserId,
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
  createTag,
  getTags,
  getTagSessions,
  logTagSession,
  getDetailedTabAnalytics,
  getDashboardStats,
  getSessionHistory,
  getMatrixTasks,
  createMatrixTask,
  updateMatrixTask,
  deleteMatrixTask,
  completeMatrixTask,
} = require('./db');
const { startScorer } = require('./scorer');
const session = require('./session');
const { google } = require('googleapis');

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
 * Bridge Django WebSocket → Express broadcast
 * When Django fires mobile_connected_notification (phone scanned QR),
 * we relay it to Electron so the QR wait page transitions to active.
 */
function startDjangoBridge(sessionId) {
  if (!sessionId) return;
  try {
    const djangoWs = new (require('ws'))(`ws://127.0.0.1:8000/ws/session/${sessionId}/`);
    djangoWs.on('open', () => {
      console.log(`[Bridge] Connected to Django WS for session ${sessionId}`);
      // Identify as desktop so Django marks it connected
      djangoWs.send(JSON.stringify({
        device: 'desktop', event: 'session_start', session_id: sessionId,
      }));
    });
    djangoWs.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        // Relay phone connection events to Electron
        if (
          msg.type === 'mobile_connected_notification' ||
          msg.type === 'phone_connected' ||
          msg.type === 'score_update' ||
          msg.type === 'raw_mobile_signal' ||
          msg.type === 'distraction_alert' ||
          msg.type === 'device_disconnected'
        ) {
          broadcast(msg); // forward to all Express WS clients (Electron)
        }
      } catch (_) { }   
    });
    djangoWs.on('error', (e) => console.warn('[Bridge] Django WS error:', e.message));
    djangoWs.on('close', () => console.log('[Bridge] Django WS closed'));
    return djangoWs;
  } catch (e) {
    console.warn('[Bridge] Could not start Django bridge:', e.message);
    return null;
  }
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

    // ─── Network info (returns PC's real LAN IPs) ───
    app.get('/network-info', (req, res) => {
      const interfaces = os.networkInterfaces();
      const ips = [];
      for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
          // Skip loopback and IPv6
          if (iface.family === 'IPv4' && !iface.internal) {
            ips.push({ name, address: iface.address });
          }
        }
      }
      // Prefer Wi-Fi / Ethernet - explicitly ignore Virtual, WSL, and Hotspot adapters
      const preferred = ips.find(i => {
        const lowerName = i.name.toLowerCase();
        const isVirtual = lowerName.includes('wsl') || lowerName.includes('vethernet') || lowerName.includes('virtual') || lowerName.includes('vmware');
        const isHotspot = i.address.startsWith('192.168.137');
        return !isVirtual && !isHotspot;
      }) || ips[0];
      res.json({ ips, preferred: preferred?.address || 'localhost' });
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

    // ─── AI Task Auto-Classification ───
    app.post('/ai-classify-tasks', async (req, res) => {
      const { tasks } = req.body;
      if (!tasks || !tasks.length) return res.json({ classifications: [] });
      
      try {
        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) {
           return res.json({ classifications: tasks.map(t => ({ id: t.id, quadrant: 'schedule', reason: 'Fallback' }))});
        }
        
        const prompt = `You are a productivity AI organizing tasks into the Eisenhower Matrix.
Categorize the following tasks into one of 4 quadrants: 'do_first' (Urgent & Important), 'schedule' (Not Urgent & Important), 'delegate' (Urgent & Not Important), 'eliminate' (Not Urgent & Not Important).
Tasks:
${tasks.map(t => `- [${t.id}] ${t.title}`).join('\n')}

Reply strictly with a JSON object in this exact format:
{"classifications": [{"id": "task_id", "quadrant": "do_first", "reason": "why"}]}
Nothing else, just the JSON.`;

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

        const data = await response.json();
        let content = data.choices[0].message.content;
        const jsonStart = content.indexOf('{');
        const jsonEnd = content.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1) {
          content = content.substring(jsonStart, jsonEnd + 1);
        }
        const parsed = JSON.parse(content);
        
        // Update DB
        if (parsed.classifications) {
          for (const cl of parsed.classifications) {
            await updateMatrixTask(cl.id, { quadrant: cl.quadrant });
          }
        }
        res.json({ ok: true, classifications: parsed.classifications });
      } catch (err) {
        console.error('[Server] AI classification error:', err.message);
        res.status(500).json({ error: err.message });
      }
    });

    // ═══════════════════════════════════════════
    //  SESSION ENDPOINTS (NEW)
    // ═══════════════════════════════════════════

    // Start a focus session
    app.post('/session/start', (req, res) => {
      const { goal, mode, allowedApps, tagId } = req.body;
      const info = session.startSession(goal || 'Focus Session', mode || 'basic', allowedApps || [], tagId);

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
            user_id: getUserId(),
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
            text_sec: summary.contentTypeBreakdown.text,
            video_sec: summary.contentTypeBreakdown.video,
            interactive_sec: summary.contentTypeBreakdown.interactive,
            audio_sec: summary.contentTypeBreakdown.audio,
          });

          // Also push the final score
          await supabase.from('scores').insert({
            user_id: getUserId(),
            timestamp: Date.now(),
            score: summary.avg_score,
          });

          // Save accrued per-site browser tracking
          if (summary.browserTabs && summary.browserTabs.length > 0) {
            await insertSessionSites(summary.id, summary.browserTabs);
          }

          // Log to subject tag if applicable
          if (summary.tagId) {
            const loggedMinutes = Math.max(1, summary.duration_minutes || summary.deep_work_minutes || 1);
            const dateStr = new Date(summary.start_time).toISOString().slice(0, 10);
            await logTagSession(summary.tagId, summary.id, loggedMinutes, dateStr);
          }

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

    // Track last browser event timestamp for elapsed time calculation
    let lastBrowserEventTime = 0;
    let lastBrowserHostname = '';

    app.post('/browser-event', async (req, res) => {
      try {
        const { url, category, contentType, timestamp } = req.body;
        const now = timestamp || Date.now();

        // During active session, add to session memory
        if (session.isActive()) {
          session.addEvent('chrome', 'Chrome', url, category || 'browser', false, contentType || 'text');
          try {
            const hostname = new URL(url).hostname;

            // Calculate elapsed seconds since last browser event on the SAME host
            // Cap at 5 minutes to avoid inflated times from idle/unfocused periods
            let elapsedSec = 0;
            if (lastBrowserEventTime > 0 && lastBrowserHostname) {
              const diff = Math.round((now - lastBrowserEventTime) / 1000);
              if (diff > 0 && diff <= 300) { // max 5 min
                // Attribute time to the PREVIOUS hostname (where user was)
                session.addBrowserTab(lastBrowserHostname, '', category, contentType, diff);
              }
            }

            // Record this visit (0 elapsed — time gets attributed on the NEXT event)
            session.addBrowserTab(hostname, url, category, contentType, 0);
            lastBrowserEventTime = now;
            lastBrowserHostname = hostname;
          } catch (e) {
            // invalid URL parsing
          }
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

    // Get Top Time Sinks (per-site aggregation across all sessions)
    app.get('/analytics/per-site', async (req, res) => {
      try {
        const days = parseInt(req.query.days) || 7;
        const category = req.query.category || null;
        const data = await getPerSiteAnalytics(days, category);
        res.json(data);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Get per-site analytics for a specific session ID
    app.get('/analytics/session/:id', async (req, res) => {
      try {
        const data = await getSessionSites(req.params.id);
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

    // ─── Detailed Tab Analytics ───
    app.get('/analytics/tabs-detail', async (req, res) => {
      try {
        const days = parseInt(req.query.days) || 7;
        const data = await getDetailedTabAnalytics(days);
        res.json(data);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // ─── Dashboard Stats ───
    app.get('/dashboard/stats', async (req, res) => {
      try {
        const range = req.query.range || 'week';
        const data = await getDashboardStats(range);
        res.json(data);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // ─── Session History ───
    app.get('/sessions/history', async (req, res) => {
      try {
        const limit = parseInt(req.query.limit) || 20;
        const offset = parseInt(req.query.offset) || 0;
        const data = await getSessionHistory(limit, offset);
        res.json(data);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // ═══════════════════════════════════════════
    //  SUBJECT TAGS ENDPOINTS
    // ═══════════════════════════════════════════

    app.get('/tags', async (req, res) => {
      try {
        const data = await getTags();
        res.json(data);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.post('/tags', async (req, res) => {
      try {
        const { name, color, targetMinutes, targetType } = req.body;
        if (!name || !targetMinutes || !targetType) {
          return res.status(400).json({ error: 'Missing required tag fields' });
        }
        const result = await createTag(name, color, targetMinutes, targetType);
        if (result.error) return res.status(500).json({ error: result.error });
        res.json({ ok: true, tag: result.data });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.get('/tags/:id/sessions', async (req, res) => {
      try {
        const days = parseInt(req.query.days) || 30;
        const data = await getTagSessions(req.params.id, days);
        res.json(data);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // ═══════════════════════════════════════════
    //  FOCUS ROOM ENDPOINTS
    // ═══════════════════════════════════════════

    // Create a room
    app.post('/room/create', async (req, res) => {
      try {
        const { name, displayName } = req.body;
        if (!name) return res.status(400).json({ error: 'Room name is required' });

        // Generate 6-char code
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];

        const result = await createRoom(code, name);
        if (result.error) return res.status(500).json({ error: result.error });

        // Auto-join the creator
        await joinRoom(code, displayName || 'Host');

        res.json({ ok: true, room: result.data, code });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Join a room by code
    app.post('/room/join', async (req, res) => {
      try {
        const { code, displayName } = req.body;
        if (!code) return res.status(400).json({ error: 'Room code is required' });

        const room = await getRoomByCode(code.toUpperCase());
        if (!room) return res.status(404).json({ error: 'Room not found' });

        const result = await joinRoom(code.toUpperCase(), displayName || 'Member');
        if (result.error) return res.status(500).json({ error: result.error });

        res.json({ ok: true, room, member: result.data });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Leave a room
    app.post('/room/leave', async (req, res) => {
      try {
        const { code } = req.body;
        if (!code) return res.status(400).json({ error: 'Room code is required' });

        const result = await leaveRoom(code);
        if (result.error) return res.status(500).json({ error: result.error });

        res.json({ ok: true });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Get room members
    app.get('/room/members/:code', async (req, res) => {
      try {
        const members = await getRoomMembers(req.params.code);
        const room = await getRoomByCode(req.params.code);
        res.json({ room, members });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Update member status (called by scorer hook)
    app.post('/room/status', async (req, res) => {
      try {
        const { code, status, score } = req.body;
        if (!code) return res.status(400).json({ error: 'Room code is required' });
        await updateMemberStatus(code, status, score);
        res.json({ ok: true });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Get user's active room
    app.get('/room/active', async (req, res) => {
      try {
        const roomId = await getUserActiveRoom();
        if (!roomId) return res.json({ room: null });
        const room = await getRoomByCode(roomId);
        const members = await getRoomMembers(roomId);
        res.json({ room, members });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // ═══════════════════════════════════════════
    //  EISENHOWER MATRIX ENDPOINTS
    // ═══════════════════════════════════════════

    app.get('/matrix', async (req, res) => {
      try { res.json(await getMatrixTasks()); } 
      catch (err) { res.status(500).json({ error: err.message }); }
    });

    app.post('/matrix', async (req, res) => {
      try {
        const { title, quadrant, googleEventId } = req.body;
        if (!title) return res.status(400).json({ error: 'Title required' });
        const result = await createMatrixTask(title, quadrant || 'inbox', googleEventId);
        if (result.error) return res.status(500).json({ error: result.error });
        res.json({ ok: true, task: result.data });
      } catch (err) { res.status(500).json({ error: err.message }); }
    });

    app.put('/matrix/:id', async (req, res) => {
      try {
        const result = await updateMatrixTask(req.params.id, req.body);
        if (result.error) return res.status(500).json({ error: result.error });
        res.json({ ok: true, task: result.data });
      } catch (err) { res.status(500).json({ error: err.message }); }
    });

    app.delete('/matrix/:id', async (req, res) => {
      try {
        const result = await deleteMatrixTask(req.params.id);
        if (result.error) return res.status(500).json({ error: result.error });
        res.json({ ok: true });
      } catch (err) { res.status(500).json({ error: err.message }); }
    });

    app.post('/matrix/:id/complete', async (req, res) => {
      try {
        const result = await completeMatrixTask(req.params.id);
        if (result.error) return res.status(500).json({ error: result.error });
        
        // Sync to google calendar if authenticated
        if (global.googleTokens && process.env.GOOGLE_CLIENT_ID && result.data?.google_event_id && !result.data.title.startsWith('[DONE]')) {
          const oauth2Client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
          oauth2Client.setCredentials(global.googleTokens);
          const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
          try {
            await calendar.events.patch({
              calendarId: 'primary',
              eventId: result.data.google_event_id,
              requestBody: { summary: `[DONE] ${result.data.title}` }
            });
            console.log(`[Google Calendar] Marked event ${result.data.google_event_id} as done.`);
          } catch (calErr) {
            console.error('[Google Calendar] Failed to mark event as done:', calErr.message);
          }
        }
        res.json({ ok: true, task: result.data });
      } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // ═══════════════════════════════════════════
    //  GOOGLE CALENDAR ENDPOINTS
    // ═══════════════════════════════════════════
    
    app.get('/calendar/auth-url', (req, res) => {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      if (!clientId || !clientSecret) return res.json({ url: null });
      const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, 'http://localhost:39871/calendar/callback');
      const url = oauth2Client.generateAuthUrl({
        access_type: 'offline', prompt: 'consent',
        scope: ['https://www.googleapis.com/auth/calendar.events']
      });
      res.json({ url });
    });
    
    app.get('/calendar/callback', async (req, res) => {
      const { code } = req.query;
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      try {
        const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, 'http://localhost:39871/calendar/callback');
        const { tokens } = await oauth2Client.getToken(code);
        global.googleTokens = tokens;
        res.send('<h1 style="color:#22c55e;font-family:sans-serif;margin-top:20%;text-align:center">MindForge Calendar Sync Successful</h1><p style="text-align:center">You can close this tab now and return to the app.</p>');
      } catch (err) {
        res.status(500).send('<h1 style="color:#ef4444;font-family:sans-serif;margin-top:20%;text-align:center">Authentication failed</h1><p style="text-align:center">' + err.message + '</p>');
      }
    });

    app.get('/calendar/status', (req, res) => {
      res.json({ authenticated: !!global.googleTokens });
    });
    
    app.post('/calendar/sync', async (req, res) => {
      if (!global.googleTokens) return res.status(401).json({ error: 'Not authenticated with Google' });
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      
      const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
      oauth2Client.setCredentials(global.googleTokens);
      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
      
      try {
        const response = await calendar.events.list({
          calendarId: 'primary', timeMin: new Date().toISOString(), maxResults: 15,
          singleEvents: true, orderBy: 'startTime',
        });
        const events = response.data.items;
        let syncedCount = 0;
        
        // Fetch existing task google event IDs so we don't duplicate
        const existingTasks = await getMatrixTasks();
        const existingEventIds = existingTasks.map(t => t.google_event_id).filter(Boolean);

        for (const event of events) {
          if (event.summary && !existingEventIds.includes(event.id) && !event.summary.startsWith('[DONE]')) {
            await createMatrixTask(event.summary, 'inbox', event.id);
            syncedCount++;
          }
        }
        res.json({ ok: true, syncedCount });
      } catch (err) { res.status(500).json({ error: err.message }); }
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

    server.listen(PORT, '0.0.0.0', () => {
      console.log(`[Server] Express + WS on http://0.0.0.0:${PORT} (LAN accessible)`);
      startScorer(broadcast);
      resolve();
    });
  });
}

module.exports = { startServer, broadcast };

// MindForge Chrome Extension — Background Service Worker v3.0
// Central hub: tab monitoring, ML classification, WebSocket, session state, 
// time tracking, analytics, user feedback, break mode

import { classify, getDomainTier, ensureMLReady } from './classifier.js';
import { initKNN, addFeedbackExample, getFeedbackExamples, getKNNStats } from './ml/knnClassifier.js';
import {
  onTabActivated as trackerTabActivated,
  onTabClosed as trackerTabClosed,
  updateTabClassification,
  getTimeBreakdown,
  getPerSiteAnalytics,
  getSessionAnalytics,
  resetTracking,
  persistAnalytics,
  saveFeedbackExamples,
  loadFeedbackExamples,
  loadContentPreferences,
  saveContentPreferences,
} from './tracker.js';

const API_URL = 'http://localhost:39871';
const WS_URL = 'ws://localhost:39871';

// ─── In-memory state ───

let sessionState = { active: false, goal: '', score: 0, label: '', startTime: 0 };
let wsConnection = null;
let wsReconnectDelay = 1000;
let wsReconnectTimer = null;
let desktopAlive = false;
let lastClassification = {}; // { tabId: { category, confidence, label, hostname, contentType, method } }

// ─── Storage helpers (inline for service worker module) ───
// Using chrome.storage.local (5MB limit) instead of chrome.storage.sync (8KB/item limit)
// to avoid Resource::kQuotaBytesPerItem quota exceeded errors.

async function _storageGet(key, defaultVal) {
  try {
    const result = await chrome.storage.local.get(key);
    return result[key] ?? defaultVal;
  } catch (err) {
    console.warn(`[MindForge] storage.get(${key}) error:`, err.message);
    return defaultVal;
  }
}

async function _storageSet(key, value) {
  try {
    await chrome.storage.local.set({ [key]: value });
  } catch (err) {
    console.warn(`[MindForge] storage.set(${key}) error:`, err.message);
  }
}

async function getAllowlist() { return await _storageGet('allowlist', []); }
async function getBlocklist() { return await _storageGet('blocklist', []); }

async function getSettings() {
  return await _storageGet('settings', {
    breakModeActive: false, breakModeEndsAt: 0, extensionEnabled: true,
  });
}

async function updateSettings(partial) {
  const settings = await getSettings();
  const updated = { ...settings, ...partial };
  await _storageSet('settings', updated);
  return updated;
}

async function isBreakModeActive() {
  const settings = await getSettings();
  if (!settings.breakModeActive) return false;
  if (Date.now() >= settings.breakModeEndsAt) {
    await updateSettings({ breakModeActive: false, breakModeEndsAt: 0 });
    return false;
  }
  return true;
}

async function isExtensionEnabled() {
  const settings = await getSettings();
  return settings.extensionEnabled !== false;
}

async function addClassificationEntry(entry) {
  try {
    const history = await _storageGet('classificationHistory', []);
    history.unshift({
      hostname: entry.hostname,
      category: entry.category,
      confidence: entry.confidence,
      label: entry.label || '',
      contentType: entry.contentType || 'text',
      method: entry.method || '',
      timestamp: Date.now(),
    });
    if (history.length > 50) history.length = 50;
    await _storageSet('classificationHistory', history);
  } catch (err) {
    console.warn('[MindForge] addClassificationEntry error (non-fatal):', err.message);
  }
}

// ─── Desktop App Communication ───

async function sendEventToDesktop(url, title, category, confidence, contentType) {
  try {
    const resp = await fetch(`${API_URL}/browser-event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, title, category, confidence, contentType, timestamp: Date.now() }),
    });
    const data = await resp.json();
    desktopAlive = true;
    return data;
  } catch {
    desktopAlive = false;
    return null;
  }
}

async function sendAnalyticsToDesktop(analytics) {
  try {
    const resp = await fetch(`${API_URL}/analytics/tab-time`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(analytics),
    });
    return await resp.json();
  } catch {
    return null;
  }
}

async function fetchSessionStatus() {
  try {
    const resp = await fetch(`${API_URL}/session/status`);
    const data = await resp.json();
    desktopAlive = true;

    if (data.active) {
      sessionState = {
        active: true,
        goal: data.goal || '',
        score: data.lastScore || data.avgScore || 0,
        label: data.lastScore >= 70 ? 'Deep work' : data.lastScore >= 50 ? 'Moderate' : 'Distracted',
        startTime: data.startTime || Date.now(),
        elapsedMinutes: data.elapsedMinutes || 0,
      };
    } else {
      sessionState = { active: false, goal: '', score: 0, label: '', startTime: 0 };
    }
    return sessionState;
  } catch {
    desktopAlive = false;
    return sessionState;
  }
}

// ─── WebSocket Connection ───

function connectWebSocket() {
  if (wsConnection && wsConnection.readyState <= 1) return;

  try {
    wsConnection = new WebSocket(WS_URL);

    wsConnection.onopen = () => {
      console.log('[MindForge] WebSocket connected');
      desktopAlive = true;
      wsReconnectDelay = 1000;
    };

    wsConnection.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleWSMessage(data);
      } catch (err) {
        console.warn('[MindForge] WebSocket parse error:', err.message);
      }
    };

    wsConnection.onclose = () => {
      console.log('[MindForge] WebSocket disconnected');
      wsConnection = null;
      scheduleReconnect();
    };

    wsConnection.onerror = () => {
      wsConnection?.close();
    };
  } catch {
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (wsReconnectTimer) clearTimeout(wsReconnectTimer);
  wsReconnectTimer = setTimeout(() => {
    wsReconnectDelay = Math.min(wsReconnectDelay * 2, 30000);
    connectWebSocket();
  }, wsReconnectDelay);
}

function handleWSMessage(data) {
  switch (data.type) {
    case 'score':
      sessionState.score = data.score;
      sessionState.label = data.label;
      if (data.session) {
        sessionState.active = data.session.active;
        sessionState.goal = data.session.goal || sessionState.goal;
        sessionState.elapsedMinutes = data.session.elapsedMinutes || 0;
      }
      break;

    case 'intervention':
      forwardToActiveTab({ type: 'INTERVENTION', message: data.message, score: data.score });
      break;

    case 'session_started':
      sessionState = {
        active: true,
        goal: data.goal || '',
        score: 0,
        label: '',
        startTime: data.startTime || Date.now(),
        elapsedMinutes: 0,
      };
      // Reset tracking for new session
      resetTracking();
      classifyActiveTab();
      break;

    case 'session_ended': {
      // Send analytics to desktop before clearing
      const analytics = getSessionAnalytics();
      sendAnalyticsToDesktop(analytics).catch(() => {});
      // Save content preferences
      const breakdown = getTimeBreakdown();
      saveContentPreferences(breakdown.contentType).catch(() => {});
      // Persist analytics
      persistAnalytics().catch(() => {});

      sessionState = { active: false, goal: '', score: 0, label: '', startTime: 0 };
      broadcastToAllTabs({ type: 'HIDE_OVERLAY' });
      break;
    }

    case 'session_status':
      if (data.active) {
        sessionState.active = true;
        sessionState.goal = data.goal || '';
        sessionState.score = data.lastScore || 0;
        sessionState.startTime = data.startTime || Date.now();
      }
      break;
  }
}

// ─── Tab Communication Helpers ───

async function forwardToActiveTab(message) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await chrome.tabs.sendMessage(tab.id, message);
    }
  } catch {
    // Content script may not be ready
  }
}

async function broadcastToAllTabs(message) {
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, message).catch(() => {});
      }
    }
  } catch {}
}

// ─── Classification Logic ───

async function classifyTab(tabId, url, title) {
  console.log(`[MindForge] classifyTab called — tab:${tabId} url:${url}`);

  if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('about:')) {
    console.log('[MindForge] Skipping — internal URL');
    return;
  }

  const enabled = await isExtensionEnabled();
  if (!enabled) {
    console.log('[MindForge] Skipping — extension disabled');
    return;
  }

  // Check break mode
  const onBreak = await isBreakModeActive();
  if (onBreak) {
    console.log('[MindForge] Skipping — break mode');
    try {
      await chrome.tabs.sendMessage(tabId, { type: 'HIDE_OVERLAY', reason: 'break' });
    } catch (e) { console.warn('[MindForge] sendMessage error (break):', e.message); }
    lastClassification[tabId] = { category: 'break', confidence: 1, label: 'Break mode', hostname: '' };
    return;
  }

  // Build extracted content
  let hostname = '';
  try { hostname = new URL(url).hostname; } catch {}

  // Track tab activation
  trackerTabActivated(tabId, url, hostname);

  let extractedContent;
  try {
    extractedContent = await chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_CONTENT' });
    console.log(`[MindForge] Content extracted via content script: ${extractedContent?.extractionMethod}`);
  } catch (e) {
    console.log(`[MindForge] Content script not available, using basic info: ${e.message}`);
    extractedContent = { title: title || '', url, hostname, content: '', extractionMethod: 'none' };
  }

  if (!extractedContent || !extractedContent.url) {
    extractedContent = { title: title || '', url, hostname, content: '', extractionMethod: 'none' };
  }

  const allowlist = await getAllowlist();
  const blocklist = await getBlocklist();

  const result = await classify(
    extractedContent,
    sessionState.goal,
    allowlist,
    blocklist,
    sessionState.active
  );

  // Store result (now includes contentType and method)
  lastClassification[tabId] = { ...result, hostname: extractedContent.hostname };
  console.log(`[MindForge] ▸ Tab ${tabId} classified: ${result.category} (${result.confidence.toFixed(2)}) [${result.method}] — ${extractedContent.hostname} — contentType: ${result.contentType} — session:${sessionState.active}`);

  // Update tracker with classification result
  updateTabClassification(tabId, result.category, result.contentType);

  // Log to history (non-blocking — errors here must NOT prevent overlay display)
  addClassificationEntry({
    hostname: extractedContent.hostname,
    category: result.category,
    confidence: result.confidence,
    label: result.label,
    contentType: result.contentType,
    method: result.method,
  }).catch(err => console.warn('[MindForge] History log error:', err.message));

  // Send event to desktop app (non-blocking)
  sendEventToDesktop(url, extractedContent.title, result.category, result.confidence, result.contentType)
    .catch(err => console.warn('[MindForge] Desktop event error:', err.message));

  // Determine UI action based on classification
  if (!sessionState.active) {
    console.log('[MindForge] No active session — indicator only');
    try {
      await chrome.tabs.sendMessage(tabId, {
        type: 'UPDATE_INDICATOR',
        category: result.category,
        confidence: result.confidence,
      });
    } catch (e) { console.warn('[MindForge] sendMessage error (indicator):', e.message); }
    return;
  }

  // Session is active — apply friction based on confidence
  if (result.category === 'distraction') {
    if (result.confidence >= 0.75) {
      console.log(`[MindForge] 🚫 Showing FULL OVERLAY for ${extractedContent.hostname}`);
      try {
        await chrome.tabs.sendMessage(tabId, {
          type: 'SHOW_OVERLAY',
          goal: sessionState.goal,
          score: sessionState.score,
          confidence: result.confidence,
          hostname: extractedContent.hostname,
        });
      } catch (e) { console.warn('[MindForge] sendMessage error (overlay):', e.message); }
    } else if (result.confidence >= 0.45) {
      console.log(`[MindForge] ⚠ Showing NUDGE for ${extractedContent.hostname}`);
      try {
        await chrome.tabs.sendMessage(tabId, {
          type: 'SHOW_NUDGE',
          goal: sessionState.goal,
          confidence: result.confidence,
          hostname: extractedContent.hostname,
        });
      } catch (e) { console.warn('[MindForge] sendMessage error (nudge):', e.message); }
    } else {
      console.log(`[MindForge] Low confidence distraction (${result.confidence.toFixed(2)}) — logging only`);
    }
  } else if (result.category === 'productive') {
    try {
      await chrome.tabs.sendMessage(tabId, { type: 'HIDE_OVERLAY' });
      await chrome.tabs.sendMessage(tabId, {
        type: 'UPDATE_INDICATOR',
        category: 'productive',
        confidence: result.confidence,
      });
    } catch (e) { console.warn('[MindForge] sendMessage error (productive):', e.message); }
  } else {
    // Neutral — start a 3-minute timer that will prompt the user
    try {
      await chrome.tabs.sendMessage(tabId, {
        type: 'SHOW_NEUTRAL_TIMER',
        goal: sessionState.goal,
        hostname: extractedContent.hostname,
        delayMs: 3 * 60 * 1000, // 3 minutes
      });
      await chrome.tabs.sendMessage(tabId, {
        type: 'UPDATE_INDICATOR',
        category: 'neutral',
        confidence: result.confidence,
      });
    } catch (e) { console.warn('[MindForge] sendMessage error (neutral):', e.message); }
  }
}

async function classifyActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    console.log('[MindForge] classifyActiveTab —', tab?.url || 'no tab');
    if (tab?.id && tab?.url) {
      await classifyTab(tab.id, tab.url, tab.title);
    }
  } catch (err) {
    console.error('[MindForge] classifyActiveTab error:', err);
  }
}

// ─── Tab Listeners ───

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  console.log(`[MindForge] Tab activated: ${activeInfo.tabId}`);
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.url) {
      await classifyTab(tab.id, tab.url, tab.title);
    }
  } catch (err) {
    console.error('[MindForge] Tab activated error:', err);
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    console.log(`[MindForge] Tab updated (complete): ${tabId} — ${tab.url}`);
    await classifyTab(tabId, tab.url, tab.title);
  }
});

// Clean up classification cache and tracker when tabs close
chrome.tabs.onRemoved.addListener((tabId) => {
  delete lastClassification[tabId];
  trackerTabClosed(tabId);
});

// ─── Message Handler ───

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse).catch((err) => {
    console.error('[MindForge] Message handler error:', err);
    sendResponse({ error: err.message });
  });
  return true; // Keep sendResponse alive for async
});

async function handleMessage(message, sender) {
  switch (message.type) {
    case 'GET_SESSION_STATUS':
      return {
        ...sessionState,
        desktopAlive,
        breakModeActive: await isBreakModeActive(),
        breakModeEndsAt: (await getSettings()).breakModeEndsAt,
      };

    case 'GET_CLASSIFICATION': {
      const tabId = message.tabId || sender.tab?.id;
      return lastClassification[tabId] || { category: 'unknown', confidence: 0, label: '' };
    }

    case 'START_BREAK': {
      const minutes = message.minutes || 5;
      const endsAt = Date.now() + minutes * 60 * 1000;
      await updateSettings({ breakModeActive: true, breakModeEndsAt: endsAt });
      await broadcastToAllTabs({ type: 'HIDE_OVERLAY', reason: 'break' });
      return { ok: true, endsAt };
    }

    case 'END_BREAK':
      await updateSettings({ breakModeActive: false, breakModeEndsAt: 0 });
      await classifyActiveTab();
      return { ok: true };

    case 'ADD_TO_ALLOWLIST': {
      const h = (message.hostname || '').toLowerCase().replace(/^www\./, '');
      if (!h) return { ok: false, error: 'No hostname' };
      const list = await getAllowlist();
      if (!list.includes(h)) {
        list.push(h);
        await _storageSet('allowlist', list);
      }
      await classifyActiveTab();
      return { ok: true, allowlist: list };
    }

    case 'ADD_TO_BLOCKLIST': {
      const h = (message.hostname || '').toLowerCase().replace(/^www\./, '');
      if (!h) return { ok: false, error: 'No hostname' };
      const list = await getBlocklist();
      if (!list.includes(h)) {
        list.push(h);
        await _storageSet('blocklist', list);
      }
      await classifyActiveTab();
      return { ok: true, blocklist: list };
    }

    case 'REMOVE_FROM_ALLOWLIST': {
      const h = (message.hostname || '').toLowerCase().replace(/^www\./, '');
      let list = await getAllowlist();
      list = list.filter(d => d !== h);
      await _storageSet('allowlist', list);
      return { ok: true, allowlist: list };
    }

    case 'REMOVE_FROM_BLOCKLIST': {
      const h = (message.hostname || '').toLowerCase().replace(/^www\./, '');
      let list = await getBlocklist();
      list = list.filter(d => d !== h);
      await _storageSet('blocklist', list);
      return { ok: true, blocklist: list };
    }

    case 'OVERRIDE_CLASSIFICATION': {
      // User clicked "continue anyway" or "this is relevant"
      await addClassificationEntry({
        hostname: message.hostname,
        category: 'override',
        confidence: 0,
        label: `User override: ${message.originalCategory}`,
      });
      return { ok: true };
    }

    // ═══════════════════════════════════════
    //  NEW: User Feedback for ML Learning
    // ═══════════════════════════════════════
    case 'SUBMIT_FEEDBACK': {
      // User labeled a page as productive/distraction via popup
      const extractedContent = {
        title: message.title || '',
        url: message.url || '',
        hostname: message.hostname || '',
        content: message.content || '',
      };
      const category = message.category; // productive or distraction
      const goalText = sessionState.goal || '';

      const example = addFeedbackExample(extractedContent, category, goalText);

      // Persist feedback to storage
      const allExamples = getFeedbackExamples();
      await saveFeedbackExamples(allExamples);

      // Re-classify active tab with updated ML model
      await classifyActiveTab();

      console.log(`[MindForge] User feedback: ${category} for ${message.hostname} (goal: "${goalText}")`);
      return { ok: true, totalExamples: allExamples.length };
    }

    // ═══════════════════════════════════════
    //  NEW: Analytics Endpoints
    // ═══════════════════════════════════════
    case 'GET_ANALYTICS': {
      const timeBreakdown = getTimeBreakdown();
      const perSite = getPerSiteAnalytics();
      const knnStats = getKNNStats();
      return {
        timeBreakdown,
        perSite,
        mlStats: knnStats,
        sessionActive: sessionState.active,
        sessionGoal: sessionState.goal,
      };
    }

    case 'GET_CONTENT_PREFERENCES': {
      const prefs = await loadContentPreferences();
      const current = getTimeBreakdown();
      return {
        history: prefs,
        current: current.contentType,
      };
    }

    case 'GET_ML_STATS': {
      return getKNNStats();
    }

    case 'UPDATE_EXTENSION_ENABLED': {
      await updateSettings({ extensionEnabled: message.enabled });
      if (!message.enabled) {
        await broadcastToAllTabs({ type: 'HIDE_OVERLAY' });
      }
      return { ok: true };
    }

    case 'CLEAR_HISTORY':
      await _storageSet('classificationHistory', []);
      return { ok: true };

    case 'GET_HISTORY':
      return await _storageGet('classificationHistory', []);

    case 'GET_LISTS':
      return { allowlist: await getAllowlist(), blocklist: await getBlocklist() };

    case 'CONTENT_EXTRACTED': {
      const tabId = sender.tab?.id;
      const tabUrl = sender.tab?.url;
      if (tabId && message.data) {
        classifyTab(tabId, tabUrl || message.data.url, message.data.title).catch(() => {});
      }
      return { ok: true };
    }

    default:
      return { error: `Unknown message type: ${message.type}` };
  }
}

async function injectContentScriptsIntoExistingTabs() {
  try {
    const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
    console.log(`[MindForge] Injecting content scripts into ${tabs.length} existing tabs`);
    for (const tab of tabs) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['libs/Readability.js', 'extractor.js', 'content.js'],
        });
        console.log(`[MindForge] Injected into tab ${tab.id}: ${tab.url}`);
      } catch (e) {
        console.log(`[MindForge] Could not inject into tab ${tab.id}: ${e.message}`);
      }
    }
  } catch (err) {
    console.error('[MindForge] Error injecting content scripts:', err);
  }
}

async function initialize() {
  console.log('[MindForge] Extension v3.0 initializing (ML-enhanced)...');

  // ─── One-time migration: sync → local storage ───
  // Previous versions used chrome.storage.sync (8KB/item limit) which caused
  // Resource::kQuotaBytesPerItem errors. Migrate any existing data to local.
  try {
    const migrated = await chrome.storage.local.get('_migrated_from_sync');
    if (!migrated._migrated_from_sync) {
      console.log('[MindForge] Migrating data from sync → local storage...');
      const syncData = await chrome.storage.sync.get(null); // get everything
      if (syncData && Object.keys(syncData).length > 0) {
        // Copy settings/lists (skip overly large history to avoid issues)
        const toMigrate = {};
        for (const [key, val] of Object.entries(syncData)) {
          if (key === 'classificationHistory') continue; // skip — too large
          toMigrate[key] = val;
        }
        if (Object.keys(toMigrate).length > 0) {
          await chrome.storage.local.set(toMigrate);
          console.log(`[MindForge] Migrated ${Object.keys(toMigrate).length} keys from sync`);
        }
      }
      // Clear sync storage to free quota
      await chrome.storage.sync.clear();
      await chrome.storage.local.set({ _migrated_from_sync: true });
      console.log('[MindForge] Sync storage cleared, migration complete');
    }
  } catch (err) {
    console.warn('[MindForge] Migration error (non-fatal):', err.message);
  }

  // Initialize ML models
  try {
    ensureMLReady();
    console.log('[MindForge] ML models loaded');
  } catch (err) {
    console.error('[MindForge] ML init error:', err);
  }

  // Load user feedback for KNN
  try {
    const feedbackExamples = await loadFeedbackExamples();
    initKNN(feedbackExamples);
  } catch (err) {
    console.warn('[MindForge] Could not load feedback examples:', err.message);
    initKNN([]);
  }

  // Check desktop app status
  await fetchSessionStatus();
  console.log('[MindForge] Session state:', JSON.stringify(sessionState));

  // Connect WebSocket
  connectWebSocket();

  // Inject content scripts into tabs that existed before the extension loaded
  await injectContentScriptsIntoExistingTabs();

  // Classify the current active tab
  await classifyActiveTab();

  console.log('[MindForge] Extension ready. Desktop:', desktopAlive ? 'connected' : 'disconnected',
    'Session:', sessionState.active ? `active ("${sessionState.goal}")` : 'inactive');
}

// Run on service worker start
initialize();
console.log('[MindForge] Service worker script loaded (v3.0 — ML-enhanced)');

// Periodic session status check (every 30s) + analytics persistence
setInterval(async () => {
  await fetchSessionStatus();
  if (!wsConnection || wsConnection.readyState > 1) {
    connectWebSocket();
  }
  // Periodically persist analytics
  if (sessionState.active) {
    persistAnalytics().catch(() => {});
  }
}, 30000);

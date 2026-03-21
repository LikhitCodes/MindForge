// MindForge — Supabase Auth Module
// Handles sign up, sign in, sign out, session management

const { createClient } = require('@supabase/supabase-js');

let supabase = null;
let currentUser = null;
let authChangeCallbacks = [];

/**
 * Initialize the auth-only Supabase client.
 * This is separate from the DB client so auth can work before DB is ready.
 */
function initAuth() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  if (!url || !key || url === 'your_supabase_url_here') {
    console.error('[Auth] Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env');
    return false;
  }

  supabase = createClient(url, key, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      // Use in-memory storage for Electron (no localStorage in main process)
      storage: {
        getItem: (key) => authStorage[key] || null,
        setItem: (key, value) => { authStorage[key] = value; },
        removeItem: (key) => { delete authStorage[key]; },
      },
    },
  });

  // Listen for auth state changes
  supabase.auth.onAuthStateChange((event, session) => {
    currentUser = session?.user || null;
    console.log(`[Auth] State change: ${event}, user: ${currentUser?.email || 'none'}`);
    authChangeCallbacks.forEach(cb => {
      try { cb(event, session); } catch (e) { console.error('[Auth] Callback error:', e); }
    });
  });

  console.log('[Auth] Supabase auth client initialized');
  return true;
}

// Simple in-memory storage for auth tokens in Electron main process
const authStorage = {};

/**
 * Sign up with email & password
 */
async function signUp(email, password) {
  if (!supabase) return { error: { message: 'Auth not initialized' } };

  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) {
    console.error('[Auth] Sign up error:', error.message);
    return { user: null, error: { message: error.message } };
  }

  currentUser = data.user;
  return { user: data.user, session: data.session, error: null };
}

/**
 * Sign in with email & password
 */
async function signIn(email, password) {
  if (!supabase) return { error: { message: 'Auth not initialized' } };

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    console.error('[Auth] Sign in error:', error.message);
    return { user: null, error: { message: error.message } };
  }

  currentUser = data.user;
  return {
    user: data.user,
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    },
    error: null,
  };
}

/**
 * Sign out the current user
 */
async function signOut() {
  if (!supabase) return { error: { message: 'Auth not initialized' } };

  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error('[Auth] Sign out error:', error.message);
    return { error: { message: error.message } };
  }

  currentUser = null;
  return { error: null };
}

/**
 * Get the current logged-in user
 */
function getUser() {
  return currentUser;
}

/**
 * Get current user's ID (for RLS/inserts)
 */
function getUserId() {
  return currentUser?.id || null;
}

/**
 * Get current session (for passing tokens to the DB client)
 */
async function getSession() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data?.session || null;
}

/**
 * Register a callback for auth state changes
 */
function onAuthStateChange(callback) {
  authChangeCallbacks.push(callback);
}

/**
 * Get the auth Supabase client (for admin ops like migration)
 */
function getAuthClient() {
  return supabase;
}

module.exports = {
  initAuth,
  signUp,
  signIn,
  signOut,
  getUser,
  getUserId,
  getSession,
  onAuthStateChange,
  getAuthClient,
};

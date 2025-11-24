const { v4: uuidv4 } = require('uuid');

let kv = null;
try {
  kv = require('@vercel/kv').kv;
} catch (error) {
  // KV not available, will use in-memory fallback
}

/**
 * Session Manager
 * Handles user sessions for multi-user Vercel deployment
 */

// In-memory fallback for local development
const sessionStore = new Map();

/**
 * Create a new session
 * @param {object} userData - User data to store (e.g., username)
 * @returns {Promise<string>} Session ID
 */
async function createSession(userData = {}) {
  const sessionId = uuidv4();
  const sessionData = {
    ...userData,
    createdAt: new Date().toISOString()
  };

  if (kv) {
    try {
      // Store in Vercel KV with 90 day expiration
      await kv.set(`session:${sessionId}`, sessionData, { ex: 90 * 24 * 60 * 60 });
      console.log(`✅ Session created (KV): ${sessionId}`);
      return sessionId;
    } catch (error) {
      console.error('❌ Error creating session in KV:', error.message);
      // Fall through to in-memory
    }
  }

  // In-memory fallback
  sessionStore.set(sessionId, sessionData);
  console.log(`✅ Session created (memory): ${sessionId}`);
  return sessionId;
}

/**
 * Get session data
 * @param {string} sessionId - Session ID
 * @returns {Promise<object|null>} Session data or null if not found
 */
async function getSession(sessionId) {
  if (!sessionId) {
    return null;
  }

  if (kv) {
    try {
      const data = await kv.get(`session:${sessionId}`);
      return data;
    } catch (error) {
      console.error('❌ Error getting session from KV:', error.message);
      return null;
    }
  }

  // In-memory fallback
  return sessionStore.get(sessionId) || null;
}

/**
 * Update session data
 * @param {string} sessionId - Session ID
 * @param {object} updates - Data to update
 * @returns {Promise<boolean>} Success status
 */
async function updateSession(sessionId, updates) {
  if (!sessionId) {
    return false;
  }

  if (kv) {
    try {
      const existing = await kv.get(`session:${sessionId}`);
      if (!existing) {
        return false;
      }
      
      const updated = { ...existing, ...updates };
      await kv.set(`session:${sessionId}`, updated, { ex: 90 * 24 * 60 * 60 });
      return true;
    } catch (error) {
      console.error('❌ Error updating session in KV:', error.message);
      return false;
    }
  }

  // In-memory fallback
  const existing = sessionStore.get(sessionId);
  if (!existing) {
    return false;
  }
  
  sessionStore.set(sessionId, { ...existing, ...updates });
  return true;
}

/**
 * Delete a session
 * @param {string} sessionId - Session ID
 * @returns {Promise<boolean>} Success status
 */
async function deleteSession(sessionId) {
  if (!sessionId) {
    return false;
  }

  if (kv) {
    try {
      await kv.del(`session:${sessionId}`);
      console.log(`🗑️  Session deleted (KV): ${sessionId}`);
      return true;
    } catch (error) {
      console.error('❌ Error deleting session from KV:', error.message);
      return false;
    }
  }

  // In-memory fallback
  sessionStore.delete(sessionId);
  console.log(`🗑️  Session deleted (memory): ${sessionId}`);
  return true;
}

/**
 * Validate session exists and is active
 * @param {string} sessionId - Session ID
 * @returns {Promise<boolean>} Whether session is valid
 */
async function isValidSession(sessionId) {
  if (!sessionId) {
    return false;
  }

  const session = await getSession(sessionId);
  return !!session;
}

module.exports = {
  createSession,
  getSession,
  updateSession,
  deleteSession,
  isValidSession
};


const { v4: uuidv4 } = require('uuid');
const { getRedisClient } = require('./redis');

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

  const redis = await getRedisClient();
  
  if (redis) {
    try {
      // Store in Redis with 90 day expiration
      await redis.set(`session:${sessionId}`, JSON.stringify(sessionData), { EX: 90 * 24 * 60 * 60 });
      console.log(`✅ Session created (Redis): ${sessionId}`);
      return sessionId;
    } catch (error) {
      console.error('❌ Error creating session in Redis:', error.message);
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

  const redis = await getRedisClient();
  
  if (redis) {
    try {
      const data = await redis.get(`session:${sessionId}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('❌ Error getting session from Redis:', error.message);
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

  const redis = await getRedisClient();
  
  if (redis) {
    try {
      const existingData = await redis.get(`session:${sessionId}`);
      if (!existingData) {
        return false;
      }
      
      const existing = JSON.parse(existingData);
      const updated = { ...existing, ...updates };
      await redis.set(`session:${sessionId}`, JSON.stringify(updated), { EX: 90 * 24 * 60 * 60 });
      return true;
    } catch (error) {
      console.error('❌ Error updating session in Redis:', error.message);
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

  const redis = await getRedisClient();
  
  if (redis) {
    try {
      await redis.del(`session:${sessionId}`);
      console.log(`🗑️  Session deleted (Redis): ${sessionId}`);
      return true;
    } catch (error) {
      console.error('❌ Error deleting session from Redis:', error.message);
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

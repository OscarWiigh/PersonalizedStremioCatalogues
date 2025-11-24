const fetch = require('node-fetch');
const { getRedisClient } = require('./redis');

/**
 * Token Manager (Multi-User with Vercel Redis)
 * Handles storage, retrieval, and refresh of Trakt OAuth tokens per session
 */

// In-memory fallback for local development
const tokenStore = new Map();

/**
 * Load tokens for a specific session
 * @param {string} sessionId - Session ID
 * @returns {Promise<object|null>} Token data or null if not found
 */
async function loadTokens(sessionId) {
  if (!sessionId) {
    console.log('ℹ️  No session ID provided');
    return null;
  }

  const redis = await getRedisClient();
  
  if (redis) {
    try {
      const tokensData = await redis.get(`tokens:${sessionId}`);
      if (tokensData) {
        console.log(`✅ Tokens loaded (Redis) for session: ${sessionId.substring(0, 8)}...`);
        return JSON.parse(tokensData);
      }
      return null;
    } catch (error) {
      console.error('❌ Error loading tokens from Redis:', error.message);
      return null;
    }
  }

  // In-memory fallback
  const tokens = tokenStore.get(sessionId);
  if (tokens) {
    console.log(`✅ Tokens loaded (memory) for session: ${sessionId.substring(0, 8)}...`);
  }
  return tokens || null;
}

/**
 * Save tokens for a specific session
 * @param {string} sessionId - Session ID
 * @param {object} tokenData - Token data to save
 * @returns {Promise<void>}
 */
async function saveTokens(sessionId, tokenData) {
  if (!sessionId) {
    throw new Error('Session ID is required');
  }

  const redis = await getRedisClient();
  
  if (redis) {
    try {
      // Store in Redis with 90 day expiration
      await redis.set(`tokens:${sessionId}`, JSON.stringify(tokenData), { EX: 90 * 24 * 60 * 60 });
      console.log(`✅ Tokens saved (Redis) for session: ${sessionId.substring(0, 8)}...`);
      return;
    } catch (error) {
      console.error('❌ Error saving tokens to Redis:', error.message);
      // Fall through to in-memory
    }
  }

  // In-memory fallback
  tokenStore.set(sessionId, tokenData);
  console.log(`✅ Tokens saved (memory) for session: ${sessionId.substring(0, 8)}...`);
}

/**
 * Check if session is authenticated
 * @param {string} sessionId - Session ID
 * @returns {Promise<boolean>} True if authenticated
 */
async function isAuthenticated(sessionId) {
  if (!sessionId) {
    return false;
  }

  const tokens = await loadTokens(sessionId);
  return tokens && tokens.access_token ? true : false;
}

/**
 * Check if token is expired or about to expire (within 1 hour)
 * @param {object} tokens - Token data
 * @returns {boolean} True if expired or expiring soon
 */
function isTokenExpired(tokens) {
  if (!tokens || !tokens.expires_at) {
    return true;
  }
  const now = Date.now();
  const expiresAt = tokens.expires_at;
  const oneHour = 60 * 60 * 1000;
  
  // Consider expired if less than 1 hour remaining
  return (expiresAt - now) < oneHour;
}

/**
 * Refresh access token using refresh token
 * @param {string} sessionId - Session ID
 * @param {object} tokens - Current token data
 * @returns {Promise<object>} New token data
 */
async function refreshAccessToken(sessionId, tokens) {
  if (!tokens || !tokens.refresh_token) {
    throw new Error('No refresh token available');
  }

  console.log(`🔄 Refreshing Trakt access token for session: ${sessionId.substring(0, 8)}...`);

  try {
    const response = await fetch('https://api.trakt.tv/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        refresh_token: tokens.refresh_token,
        client_id: tokens.client_id,
        client_secret: tokens.client_secret,
        redirect_uri: tokens.redirect_uri || 'urn:ietf:wg:oauth:2.0:oob',
        grant_type: 'refresh_token'
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Token refresh failed: ${response.status} ${response.statusText}`);
      console.error(`Response: ${errorText}`);
      throw new Error(`Token refresh failed: ${response.status}`);
    }

    const data = await response.json();
    
    // Calculate expiration timestamp (expires_in is in seconds)
    const expiresAt = Date.now() + (data.expires_in * 1000);
    
    const newTokens = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: expiresAt,
      client_id: tokens.client_id,
      client_secret: tokens.client_secret,
      redirect_uri: tokens.redirect_uri
    };

    await saveTokens(sessionId, newTokens);
    console.log('✅ Token refreshed successfully');
    
    return newTokens;
  } catch (error) {
    console.error('❌ Error refreshing token:', error.message);
    throw error;
  }
}

/**
 * Get valid access token for a session (refreshes if needed)
 * @param {string} sessionId - Session ID
 * @returns {Promise<string|null>} Access token or null if not authenticated
 */
async function getAccessToken(sessionId) {
  if (!sessionId) {
    console.log('ℹ️  No session ID provided');
    return null;
  }

  let tokens = await loadTokens(sessionId);
  
  if (!tokens) {
    console.log(`ℹ️  No authentication tokens found for session: ${sessionId.substring(0, 8)}...`);
    return null;
  }

  // Check if token needs refresh
  if (isTokenExpired(tokens)) {
    try {
      tokens = await refreshAccessToken(sessionId, tokens);
    } catch (error) {
      console.error('❌ Failed to refresh token, user needs to re-authenticate');
      return null;
    }
  }

  return tokens.access_token;
}

/**
 * Get client credentials for a session
 * @param {string} sessionId - Session ID
 * @returns {Promise<object|null>} Client credentials or null
 */
async function getClientCredentials(sessionId) {
  if (!sessionId) {
    return null;
  }

  const tokens = await loadTokens(sessionId);
  if (!tokens) {
    return null;
  }

  return {
    clientId: tokens.client_id,
    clientSecret: tokens.client_secret
  };
}

/**
 * Clear tokens for a specific session (logout)
 * @param {string} sessionId - Session ID
 * @returns {Promise<void>}
 */
async function clearTokens(sessionId) {
  if (!sessionId) {
    return;
  }

  const redis = await getRedisClient();
  
  if (redis) {
    try {
      await redis.del(`tokens:${sessionId}`);
      console.log(`✅ Tokens cleared (Redis) for session: ${sessionId.substring(0, 8)}...`);
      return;
    } catch (error) {
      console.error('❌ Error clearing tokens from Redis:', error.message);
      // Fall through
    }
  }

  // In-memory fallback
  tokenStore.delete(sessionId);
  console.log(`✅ Tokens cleared (memory) for session: ${sessionId.substring(0, 8)}...`);
}

/**
 * Get user info for a session (for testing/validation)
 * @param {string} sessionId - Session ID
 * @returns {Promise<object|null>} User info or null
 */
async function getUserInfo(sessionId) {
  const token = await getAccessToken(sessionId);
  
  if (!token) {
    return null;
  }

  const credentials = await getClientCredentials(sessionId);
  if (!credentials) {
    return null;
  }

  try {
    const response = await fetch('https://api.trakt.tv/users/me', {
      headers: {
        'Content-Type': 'application/json',
        'trakt-api-version': '2',
        'trakt-api-key': credentials.clientId,
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('❌ Error getting user info:', error.message);
    return null;
  }
}

module.exports = {
  loadTokens,
  saveTokens,
  isAuthenticated,
  getAccessToken,
  getClientCredentials,
  clearTokens,
  getUserInfo
};

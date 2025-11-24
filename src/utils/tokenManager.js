const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const TOKEN_FILE = path.join(__dirname, '../../.trakt-auth.json');

/**
 * Token Manager
 * Handles storage, retrieval, and refresh of Trakt OAuth tokens
 */

/**
 * Load tokens from file
 * @returns {object|null} Token data or null if not found
 */
function loadTokens() {
  try {
    if (!fs.existsSync(TOKEN_FILE)) {
      return null;
    }
    const data = fs.readFileSync(TOKEN_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('❌ Error loading tokens:', error.message);
    return null;
  }
}

/**
 * Save tokens to file
 * @param {object} tokenData - Token data to save
 */
function saveTokens(tokenData) {
  try {
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokenData, null, 2), 'utf8');
    console.log('✅ Tokens saved successfully');
  } catch (error) {
    console.error('❌ Error saving tokens:', error.message);
    throw error;
  }
}

/**
 * Check if user is authenticated
 * @returns {boolean} True if authenticated
 */
function isAuthenticated() {
  const tokens = loadTokens();
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
 * @param {object} tokens - Current token data
 * @returns {Promise<object>} New token data
 */
async function refreshAccessToken(tokens) {
  if (!tokens || !tokens.refresh_token) {
    throw new Error('No refresh token available');
  }

  console.log('🔄 Refreshing Trakt access token...');

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
        redirect_uri: 'urn:ietf:wg:oauth:2.0:oob',
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
      client_secret: tokens.client_secret
    };

    saveTokens(newTokens);
    console.log('✅ Token refreshed successfully');
    
    return newTokens;
  } catch (error) {
    console.error('❌ Error refreshing token:', error.message);
    throw error;
  }
}

/**
 * Get valid access token (refreshes if needed)
 * @returns {Promise<string|null>} Access token or null if not authenticated
 */
async function getAccessToken() {
  let tokens = loadTokens();
  
  if (!tokens) {
    console.log('ℹ️  No authentication tokens found');
    return null;
  }

  // Check if token needs refresh
  if (isTokenExpired(tokens)) {
    try {
      tokens = await refreshAccessToken(tokens);
    } catch (error) {
      console.error('❌ Failed to refresh token, user needs to re-authenticate');
      return null;
    }
  }

  return tokens.access_token;
}

/**
 * Clear stored tokens (logout)
 */
function clearTokens() {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      fs.unlinkSync(TOKEN_FILE);
      console.log('✅ Tokens cleared');
    }
  } catch (error) {
    console.error('❌ Error clearing tokens:', error.message);
  }
}

/**
 * Get user info (for testing/validation)
 * @returns {Promise<object|null>} User info or null
 */
async function getUserInfo() {
  const token = await getAccessToken();
  
  if (!token) {
    return null;
  }

  try {
    const response = await fetch('https://api.trakt.tv/users/me', {
      headers: {
        'Content-Type': 'application/json',
        'trakt-api-version': '2',
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
  clearTokens,
  getUserInfo
};


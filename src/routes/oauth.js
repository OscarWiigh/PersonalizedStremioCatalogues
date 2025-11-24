const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const tokenManager = require('../utils/tokenManager');
const { config } = require('../config');

const router = express.Router();

// Get the configured port for redirect URI
const PORT = config.server.port;
const REDIRECT_URI = `http://localhost:${PORT}/auth/callback`;

/**
 * OAuth Routes for Trakt Authentication
 */

/**
 * GET / - Serve landing page
 */
router.get('/', (req, res) => {
  // Read the HTML file and replace the placeholder with actual port
  const fs = require('fs');
  let html = fs.readFileSync(path.join(__dirname, '../views/index.html'), 'utf8');
  html = html.replace(/localhost:8000/g, `localhost:${PORT}`);
  res.send(html);
});

/**
 * POST /auth/start - Initiate OAuth flow
 * Receives client_id and client_secret from form, redirects to Trakt
 */
router.post('/auth/start', (req, res) => {
  const { client_id, client_secret } = req.body;
  
  if (!client_id || !client_secret) {
    return res.redirect('/error?error=' + encodeURIComponent('Client ID and Secret are required'));
  }
  
  // Trim credentials to remove accidental spaces
  const trimmedClientId = client_id.trim();
  const trimmedClientSecret = client_secret.trim();
  
  if (!trimmedClientId || !trimmedClientSecret) {
    return res.redirect('/error?error=' + encodeURIComponent('Client ID and Secret cannot be empty'));
  }
  
  console.log(`🔐 Initiating OAuth with Client ID: ${trimmedClientId.substring(0, 10)}...`);
  
  // Store credentials temporarily in session/cookie for callback
  // For single-user local setup, we can use a simple approach
  res.cookie('trakt_client_id', trimmedClientId, { httpOnly: true, maxAge: 10 * 60 * 1000 }); // 10 min
  res.cookie('trakt_client_secret', trimmedClientSecret, { httpOnly: true, maxAge: 10 * 60 * 1000 });
  
  // Build Trakt OAuth URL
  const authUrl = `https://trakt.tv/oauth/authorize?response_type=code&client_id=${encodeURIComponent(trimmedClientId)}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
  
  console.log(`   Redirect URI: ${REDIRECT_URI}`);
  res.redirect(authUrl);
});

/**
 * GET /auth/callback - OAuth callback from Trakt
 * Exchanges authorization code for access token
 */
router.get('/auth/callback', async (req, res) => {
  const { code, error } = req.query;
  
  if (error) {
    console.error(`❌ OAuth error: ${error}`);
    return res.redirect('/error?error=' + encodeURIComponent(`Trakt authorization error: ${error}`));
  }
  
  if (!code) {
    return res.redirect('/error?error=' + encodeURIComponent('No authorization code received'));
  }
  
  // Retrieve client credentials from cookies
  const clientId = req.cookies.trakt_client_id;
  const clientSecret = req.cookies.trakt_client_secret;
  
  if (!clientId || !clientSecret) {
    return res.redirect('/error?error=' + encodeURIComponent('Session expired. Please start over.'));
  }
  
  try {
    console.log('🔄 Exchanging authorization code for access token...');
    console.log(`   Redirect URI: ${REDIRECT_URI}`);
    console.log(`   Client ID (length): ${clientId.length}`);
    
    // Trim credentials in case of copy-paste issues
    const trimmedClientId = clientId.trim();
    const trimmedClientSecret = clientSecret.trim();
    
    const requestBody = {
      code: code,
      client_id: trimmedClientId,
      client_secret: trimmedClientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code'
    };
    
    console.log(`   Request body (code hidden):`, { 
      ...requestBody, 
      code: '***', 
      client_secret: '***' 
    });
    
    // Exchange code for token
    const response = await fetch('https://api.trakt.tv/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Token exchange failed: ${response.status} ${response.statusText}`);
      console.error(`Response: ${errorText}`);
      
      // Try to parse the error for more details
      let errorMsg = `Failed to get access token: ${response.statusText}`;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error_description) {
          errorMsg = errorJson.error_description;
        } else if (errorJson.error) {
          errorMsg = errorJson.error;
        }
      } catch (e) {
        // Error text wasn't JSON, use original
      }
      
      return res.redirect('/error?error=' + encodeURIComponent(errorMsg));
    }
    
    const data = await response.json();
    
    // Calculate expiration timestamp
    const expiresAt = Date.now() + (data.expires_in * 1000);
    
    // Save tokens
    const tokenData = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: expiresAt,
      client_id: trimmedClientId,
      client_secret: trimmedClientSecret
    };
    
    tokenManager.saveTokens(tokenData);
    
    // Clear cookies
    res.clearCookie('trakt_client_id');
    res.clearCookie('trakt_client_secret');
    
    console.log('✅ Authentication successful!');
    
    // Get user info for confirmation
    const userInfo = await tokenManager.getUserInfo();
    if (userInfo) {
      console.log(`✅ Authenticated as: ${userInfo.username}`);
    }
    
    res.redirect('/success');
  } catch (error) {
    console.error('❌ Error during token exchange:', error.message);
    res.redirect('/error?error=' + encodeURIComponent(`Error: ${error.message}`));
  }
});

/**
 * GET /success - Success page
 */
router.get('/success', (req, res) => {
  const fs = require('fs');
  let html = fs.readFileSync(path.join(__dirname, '../views/success.html'), 'utf8');
  // Replace port in stremio:// URL
  html = html.replace(/stremio:\/\/127\.0\.0\.1:8000/g, `stremio://127.0.0.1:${PORT}`);
  res.send(html);
});

/**
 * GET /error - Error page
 */
router.get('/error', (req, res) => {
  res.sendFile(path.join(__dirname, '../views/error.html'));
});

/**
 * GET /auth/status - Check authentication status (JSON API)
 */
router.get('/auth/status', async (req, res) => {
  const isAuth = tokenManager.isAuthenticated();
  
  if (!isAuth) {
    return res.json({
      authenticated: false,
      message: 'Not authenticated'
    });
  }
  
  try {
    const userInfo = await tokenManager.getUserInfo();
    
    if (userInfo) {
      res.json({
        authenticated: true,
        username: userInfo.username,
        name: userInfo.name,
        vip: userInfo.vip || false,
        message: 'Successfully authenticated'
      });
    } else {
      res.json({
        authenticated: false,
        message: 'Token invalid or expired'
      });
    }
  } catch (error) {
    res.json({
      authenticated: false,
      error: error.message
    });
  }
});

/**
 * POST /auth/logout - Clear tokens
 */
router.post('/auth/logout', (req, res) => {
  tokenManager.clearTokens();
  console.log('✅ Logged out');
  res.redirect('/');
});

module.exports = router;


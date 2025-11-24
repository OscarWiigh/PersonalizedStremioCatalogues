const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const tokenManager = require('../utils/tokenManager');
const sessionManager = require('../utils/sessionManager');
const { config } = require('../config');

const router = express.Router();

// Get base URL from the actual request (supports any Vercel URL including previews)
function getBaseUrl(req) {
  const host = req.get('host');
  
  // Vercel always uses HTTPS, localhost uses HTTP
  let protocol = 'http';
  
  // Check if running on Vercel or if the request came through HTTPS
  if (process.env.VERCEL || req.get('x-forwarded-proto') === 'https' || req.secure) {
    protocol = 'https';
  }
  
  // For localhost, keep HTTP
  if (host && host.includes('localhost')) {
    protocol = 'http';
  }
  
  return `${protocol}://${host}`;
}

/**
 * OAuth Routes for Trakt Authentication (Multi-User)
 */

/**
 * GET / - Serve landing page
 */
router.get('/', (req, res) => {
  const fs = require('fs');
  let html = fs.readFileSync(path.join(__dirname, '../views/index.html'), 'utf8');
  const baseUrl = getBaseUrl(req);
  const redirectUri = `${baseUrl}/auth/callback`;
  
  // Replace localhost:8000 with actual base URL
  html = html.replace(/localhost:8000/g, baseUrl.replace(/^https?:\/\//, ''));
  // Replace the redirect URI in the instructions
  html = html.replace(/http:\/\/localhost:8000\/auth\/callback/g, redirectUri);
  
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
  
  // Store credentials temporarily in cookies for callback
  res.cookie('trakt_client_id', trimmedClientId, { httpOnly: true, maxAge: 10 * 60 * 1000, sameSite: 'lax' });
  res.cookie('trakt_client_secret', trimmedClientSecret, { httpOnly: true, maxAge: 10 * 60 * 1000, sameSite: 'lax' });
  
  // Build redirect URI based on environment
  const baseUrl = getBaseUrl(req);
  const redirectUri = `${baseUrl}/auth/callback`;
  
  // Store redirect URI for callback
  res.cookie('trakt_redirect_uri', redirectUri, { httpOnly: true, maxAge: 10 * 60 * 1000, sameSite: 'lax' });
  
  // Build Trakt OAuth URL
  const authUrl = `https://trakt.tv/oauth/authorize?response_type=code&client_id=${encodeURIComponent(trimmedClientId)}&redirect_uri=${encodeURIComponent(redirectUri)}`;
  
  console.log(`   Redirect URI: ${redirectUri}`);
  res.redirect(authUrl);
});

/**
 * GET /auth/callback - OAuth callback from Trakt
 * Exchanges authorization code for access token and creates session
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
  const redirectUri = req.cookies.trakt_redirect_uri;
  
  if (!clientId || !clientSecret || !redirectUri) {
    return res.redirect('/error?error=' + encodeURIComponent('Session expired. Please start over.'));
  }
  
  try {
    console.log('🔄 Exchanging authorization code for access token...');
    console.log(`   Redirect URI: ${redirectUri}`);
    console.log(`   Client ID (length): ${clientId.length}`);
    
    // Trim credentials in case of copy-paste issues
    const trimmedClientId = clientId.trim();
    const trimmedClientSecret = clientSecret.trim();
    
    const requestBody = {
      code: code,
      client_id: trimmedClientId,
      client_secret: trimmedClientSecret,
      redirect_uri: redirectUri,
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
    
    // Create a new session for this user
    const sessionId = await sessionManager.createSession({
      authenticatedAt: new Date().toISOString()
    });
    
    console.log(`✅ Created session: ${sessionId.substring(0, 8)}...`);
    
    // Save tokens with session ID
    const tokenData = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: expiresAt,
      client_id: trimmedClientId,
      client_secret: trimmedClientSecret,
      redirect_uri: redirectUri
    };
    
    await tokenManager.saveTokens(sessionId, tokenData);
    
    // Clear cookies
    res.clearCookie('trakt_client_id');
    res.clearCookie('trakt_client_secret');
    res.clearCookie('trakt_redirect_uri');
    
    console.log('✅ Authentication successful!');
    
    // Get user info for confirmation
    const userInfo = await tokenManager.getUserInfo(sessionId);
    if (userInfo) {
      console.log(`✅ Authenticated as: ${userInfo.username}`);
      // Store username in session
      await sessionManager.updateSession(sessionId, { username: userInfo.username });
    }
    
    // Redirect to success page with session ID
    res.redirect(`/success?session=${sessionId}`);
  } catch (error) {
    console.error('❌ Error during token exchange:', error.message);
    res.redirect('/error?error=' + encodeURIComponent(`Error: ${error.message}`));
  }
});

/**
 * GET /success - Success page
 */
router.get('/success', async (req, res) => {
  const { session } = req.query;
  
  if (!session) {
    return res.redirect('/error?error=' + encodeURIComponent('No session provided'));
  }
  
  // Verify session exists
  const isValid = await sessionManager.isValidSession(session);
  if (!isValid) {
    return res.redirect('/error?error=' + encodeURIComponent('Invalid session'));
  }
  
  const fs = require('fs');
  let html = fs.readFileSync(path.join(__dirname, '../views/success.html'), 'utf8');
  
  // Get base URL
  const baseUrl = getBaseUrl(req);
  
  // Create addon URL (user will configure session ID manually in Stremio)
  const manifestUrl = `${baseUrl}/manifest.json`;
  const stremioUrl = manifestUrl.replace(/^https?:\/\//, 'stremio://');
  
  // Replace URLs and inject session ID for user to copy
  html = html.replace(/stremio:\/\/127\.0\.0\.1:8000\/manifest\.json/g, stremioUrl);
  html = html.replace(/http:\/\/127\.0\.0\.1:8000\/manifest\.json/g, manifestUrl);
  html = html.replace(/SESSION_ID_HERE/g, session);
  
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
  const { session } = req.query;
  
  if (!session) {
    return res.json({
      authenticated: false,
      message: 'No session provided'
    });
  }
  
  const isAuth = await tokenManager.isAuthenticated(session);
  
  if (!isAuth) {
    return res.json({
      authenticated: false,
      message: 'Not authenticated'
    });
  }
  
  try {
    const userInfo = await tokenManager.getUserInfo(session);
    
    if (userInfo) {
      res.json({
        authenticated: true,
        session: session.substring(0, 8) + '...',
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
 * POST /auth/logout - Clear tokens for session
 */
router.post('/auth/logout', async (req, res) => {
  const { session } = req.body || req.query;
  
  if (session) {
    await tokenManager.clearTokens(session);
    await sessionManager.deleteSession(session);
    console.log(`✅ Logged out session: ${session.substring(0, 8)}...`);
  }
  
  res.redirect('/');
});

module.exports = router;

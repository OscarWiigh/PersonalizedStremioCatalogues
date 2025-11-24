#!/usr/bin/env node

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const { getRouter } = require('stremio-addon-sdk');
const { config, validateConfig } = require('./config');
const addonInterface = require('./addon');
const oauthRouter = require('./routes/oauth');
const importRouter = require('./routes/import');
const tokenManager = require('./utils/tokenManager');

/**
 * Stremio Add-on Server with OAuth Web Interface
 * Serves both the OAuth UI and the Stremio addon
 */

console.log('');
console.log('🎬 Starting Stremio Catalog Add-on...');
console.log('=====================================');
console.log('');

// Validate configuration
validateConfig();

// Create Express app
const app = express();
const port = config.server.port;

// Middleware
app.use(cors()); // Enable CORS for Stremio
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(bodyParser.json({ limit: '10mb' })); // Increased limit for Netflix CSV uploads
app.use(cookieParser());

// Mount OAuth routes (web interface)
app.use('/', oauthRouter);

// Mount import API routes
app.use('/', importRouter);

// Mount Stremio addon routes
const addonRouter = getRouter(addonInterface);
app.use('/', addonRouter);

// Start server
app.listen(port, '0.0.0.0', async () => {
  console.log('');
  console.log('✅ Add-on server is running!');
  console.log('=====================================');
  console.log('');
  
  // Get local IP address for Stremio desktop
  const os = require('os');
  let localIP = 'localhost';
  
  try {
    const networkInterfaces = os.networkInterfaces();
    for (const interfaceName in networkInterfaces) {
      const addresses = networkInterfaces[interfaceName];
      for (const addr of addresses) {
        if (addr.family === 'IPv4' && !addr.internal) {
          localIP = addr.address;
          break;
        }
      }
      if (localIP !== 'localhost') break;
    }
  } catch (error) {
    // Ignore errors getting network interfaces (can happen in sandboxed environments)
    console.log('ℹ️  Could not determine local IP address');
  }
  
  console.log(`📍 Web Interface (OAuth Setup): http://localhost:${port}`);
  console.log(`📄 Install in Stremio: stremio://127.0.0.1:${port}/manifest.json`);
  console.log('');
  console.log('💡 Tip: Copy the stremio:// URL above and paste it in your browser to install');
  console.log('');
  
  // Check authentication status
  const isAuth = tokenManager.isAuthenticated();
  if (isAuth) {
    const userInfo = await tokenManager.getUserInfo();
    if (userInfo) {
      console.log(`✅ Authenticated as: ${userInfo.username}`);
    } else {
      console.log('⚠️  Token expired or invalid - please re-authenticate');
    }
  } else {
    console.log('⚠️  Not authenticated yet');
    console.log('');
    console.log('🔐 OAuth Setup (First Time):');
    console.log(`   1. Visit http://localhost:${port} in your browser`);
    console.log('   2. Create a Trakt application at https://trakt.tv/oauth/applications');
    console.log(`   3. Set Redirect URI to: http://localhost:${port}/auth/callback`);
    console.log('   4. Enter your Client ID and Secret on the setup page');
    console.log('   5. Authenticate with Trakt');
    console.log('');
    console.log('📺 Install in Stremio:');
    console.log(`   • Paste in browser: stremio://127.0.0.1:${port}/manifest.json`);
  }
  
  console.log('');
  console.log('📚 Available Catalogs:');
  console.log('   • Your Personal Recommendations (movies & series)');
  console.log('   • Netflix Sweden Top 10 (movies only)');
  console.log('   • New & Popular (movies & series)');
  console.log('');
  console.log('✨ Features:');
  console.log('   • Personal Trakt recommendations');
  console.log('   • Automatic watch syncing to Trakt');
  console.log('');
  console.log('Press Ctrl+C to stop the server');
  console.log('');
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('');
  console.log('');
  console.log('👋 Shutting down server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('');
  console.log('👋 Shutting down server...');
  process.exit(0);
});


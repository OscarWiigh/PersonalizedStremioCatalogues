const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const { getRouter } = require('stremio-addon-sdk');
const { config, validateConfig } = require('./config');
const addonInterface = require('./addon');
const oauthRouter = require('./routes/oauth');
const importRouter = require('./routes/import');

/**
 * Stremio Add-on Server (Vercel + Local Development)
 * Serves both the OAuth UI and the Stremio addon
 */

// Validate configuration
validateConfig();

// Create Express app
const app = express();

// Middleware
app.use(cors()); // Enable CORS for Stremio
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(bodyParser.json({ limit: '10mb' })); // Increased limit for Netflix CSV uploads
app.use(cookieParser());

// Mount OAuth routes (web interface)
app.use('/', oauthRouter);

// Mount import API routes
app.use('/', importRouter);

// Session-specific manifest route (/:sessionId/manifest.json)
app.get('/:sessionId([a-f0-9-]{36})/manifest.json', (req, res) => {
  const sessionId = req.params.sessionId;
  const manifest = addonInterface.manifest;
  
  // Create a session-specific manifest
  const sessionManifest = {
    ...manifest,
    id: `${manifest.id}.user`,
    name: `${manifest.name} (Personal)`,
    behaviorHints: {
      configurable: false,
      configurationRequired: false
    }
  };
  
  console.log(`📄 Serving manifest for session: ${sessionId.substring(0, 8)}...`);
  res.json(sessionManifest);
});

// Session-specific catalog route
app.get('/:sessionId([a-f0-9-]{36})/catalog/:type/:id/:extra?.json', async (req, res) => {
  const { sessionId, type, id, extra } = req.params;
  
  // Parse extra parameters
  let extraObj = {};
  if (extra) {
    try {
      extraObj = JSON.parse(decodeURIComponent(extra));
    } catch (e) {
      extraObj = {};
    }
  }
  
  // Call catalog handler with session in config
  const config = {
    query: { session: sessionId },
    request: { url: req.url }
  };
  
  try {
    const result = await addonInterface.get({ resource: 'catalog', type, id, extra: extraObj, config });
    res.json(result);
  } catch (error) {
    console.error(`❌ Error serving catalog:`, error);
    res.status(500).json({ metas: [] });
  }
});

// Session-specific stream route
app.get('/:sessionId([a-f0-9-]{36})/stream/:type/:id.json', async (req, res) => {
  const { sessionId, type, id } = req.params;
  
  const config = {
    query: { session: sessionId },
    request: { url: req.url }
  };
  
  try {
    const result = await addonInterface.get({ resource: 'stream', type, id, config });
    res.json(result);
  } catch (error) {
    console.error(`❌ Error serving stream:`, error);
    res.status(500).json({ streams: [] });
  }
});

// Generic manifest route (no session - public catalogs only)
app.get('/manifest.json', (req, res) => {
  console.log('📄 Serving generic manifest (no session)');
  res.json(addonInterface.manifest);
});

// Mount default Stremio addon routes (for backward compatibility)
const addonRouter = getRouter(addonInterface);
app.use('/', addonRouter);

// Export for Vercel serverless
module.exports = app;

// Local development server (only runs if not in Vercel)
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  const port = config.server.port;
  
  app.listen(port, '0.0.0.0', async () => {
    console.log('');
    console.log('🎬 Stremio Catalog Add-on');
    console.log('=====================================');
    console.log('');
    console.log(`📍 Web Interface: http://localhost:${port}`);
    console.log(`📄 Manifest: http://127.0.0.1:${port}/manifest.json`);
    console.log('');
    console.log('🔐 Multi-User Setup:');
    console.log(`   1. Visit http://localhost:${port}`);
    console.log('   2. Create a Trakt application at https://trakt.tv/oauth/applications');
    console.log(`   3. Set Redirect URI to: http://localhost:${port}/auth/callback`);
    console.log('   4. Enter your Client ID and Secret');
    console.log('   5. Authenticate and get your personalized addon URL');
    console.log('');
    console.log('📚 Available Catalogs:');
    console.log('   • Your Personal Recommendations (requires auth)');
    console.log('   • Netflix Sweden Top 10 (public)');
    console.log('   • New & Popular from TMDB (public)');
    console.log('');
    console.log('Press Ctrl+C to stop the server');
    console.log('');
  });

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('');
    console.log('👋 Shutting down server...');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('');
    console.log('👋 Shutting down server...');
    process.exit(0);
  });
}

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

// Redis test endpoint
app.get('/test/redis', async (req, res) => {
  const { getRedisClient } = require('./utils/redis');
  try {
    const redis = await getRedisClient();
    if (redis) {
      // Test set and get
      await redis.set('test:key', 'Hello Redis!', { EX: 60 });
      const value = await redis.get('test:key');
      res.json({
        success: true,
        message: 'Redis is working!',
        testValue: value,
        redisConnected: redis.isOpen
      });
    } else {
      res.json({
        success: false,
        message: 'Redis not configured (using in-memory fallback)',
        redisConnected: false
      });
    }
  } catch (error) {
    res.json({
      success: false,
      message: 'Redis error: ' + error.message,
      error: error.toString()
    });
  }
});

// Mount OAuth routes (web interface)
app.use('/', oauthRouter);

// Mount import API routes
app.use('/', importRouter);

// Helper to validate UUID
function isValidUUID(str) {
  return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(str);
}

// Session-specific manifest route with pre-filled config
app.get('/:sessionId/manifest.json', (req, res, next) => {
  const sessionId = req.params.sessionId;
  
  if (!isValidUUID(sessionId)) {
    return next(); // Not a session ID, skip to default manifest
  }
  
  // Return manifest with session pre-configured
  const manifest = {
    ...addonInterface.manifest,
    id: `${addonInterface.manifest.id}.user`,
    name: `${addonInterface.manifest.name} (Personal)`,
    // Remove the config requirement and pre-fill the session
    behaviorHints: {
      configurable: false,
      configurationRequired: false
    }
  };
  
  // Remove config field from manifest since we're embedding session in URL
  delete manifest.config;
  
  console.log(`📄 Serving manifest with embedded session: ${sessionId.substring(0, 8)}...`);
  res.json(manifest);
});

// Session-specific catalog handler
async function handleSessionCatalog(req, res, next) {
  const { sessionId, type, id, extra } = req.params;
  
  if (!isValidUUID(sessionId)) {
    return next();
  }
  
  // Parse extra parameters
  let extraObj = {};
  if (extra) {
    try {
      const parsed = JSON.parse(decodeURIComponent(extra));
      extraObj = { ...parsed };
    } catch (e) {
      // Ignore parse errors
    }
  }
  
  // Call the catalog handler with session in config
  try {
    const result = await addonInterface.get({ 
      resource: 'catalog', 
      type, 
      id, 
      extra: extraObj,
      config: {
        session: sessionId
      }
    });
    res.json(result);
  } catch (error) {
    console.error('❌ Error in session catalog:', error);
    res.status(500).json({ metas: [] });
  }
}

// Session-specific catalog routes (with and without extra)
app.get('/:sessionId/catalog/:type/:id.json', handleSessionCatalog);
app.get('/:sessionId/catalog/:type/:id/:extra.json', handleSessionCatalog);

// Session-specific stream handler  
app.get('/:sessionId/stream/:type/:id.json', async (req, res, next) => {
  const { sessionId, type, id } = req.params;
  
  if (!isValidUUID(sessionId)) {
    return next();
  }
  
  try {
    const result = await addonInterface.get({ 
      resource: 'stream', 
      type, 
      id,
      config: {
        session: sessionId
      }
    });
    res.json(result);
  } catch (error) {
    console.error('❌ Error in session stream:', error);
    res.status(500).json({ streams: [] });
  }
});

// Generic manifest (no session)
app.get('/manifest.json', (req, res) => {
  console.log('📄 Serving generic manifest (no session, requires config)');
  res.json(addonInterface.manifest);
});

// Mount default Stremio addon routes for backward compatibility
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

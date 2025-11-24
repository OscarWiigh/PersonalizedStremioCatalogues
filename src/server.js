const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const path = require('path');
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

// Configure endpoint - serves the configuration page
app.get('/configure', (req, res) => {
  console.log('📝 Serving configuration page');
  res.sendFile(path.join(__dirname, 'views/configure.html'));
});

// Mount default Stremio addon routes with config support
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

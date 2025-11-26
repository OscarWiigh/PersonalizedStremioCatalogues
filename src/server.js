const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const path = require('path');
const fetch = require('node-fetch');
const { getRouter } = require('stremio-addon-sdk');
const { config, validateConfig } = require('./config');
const addonInterface = require('./addon');
const oauthRouter = require('./routes/oauth');
const importRouter = require('./routes/import');
const posterService = require('./services/posterService');

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

// Serve static files from public directory (for icon.png, favicon, etc.)
app.use(express.static(path.join(__dirname, '../public')));

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

// =====================================================
// POSTER ROUTES - Must be BEFORE OAuth routes
// =====================================================

// Netflix poster badge route
// Serves TMDB posters with Netflix rank badges overlaid
app.get('/poster/:type/:rank/:id.jpg', async (req, res) => {
  console.log(`🖼️  Poster request received: ${req.params.type}/${req.params.rank}/${req.params.id}`);
  
  const { type, rank, id } = req.params;
  const rankNum = parseInt(rank, 10);
  
  // Validate inputs
  if (!['movie', 'series'].includes(type)) {
    console.log(`   ❌ Invalid type: ${type}`);
    return res.status(400).send('Invalid type');
  }
  
  if (isNaN(rankNum) || rankNum < 1 || rankNum > 10) {
    console.log(`   ❌ Invalid rank: ${rank}`);
    return res.status(400).send('Invalid rank (must be 1-10)');
  }
  
  try {
    console.log(`🖼️  Poster request: type=${type}, rank=${rankNum}, id=${id}`);
    
    // Build cache key
    const cacheKey = `${type}:${rankNum}:${id}`;
    
    // Determine if id is IMDB or TMDB format
    let tmdbId = null;
    let posterPath = null;
    
    if (id.startsWith('tt')) {
      // IMDB ID - need to look up TMDB data
      console.log(`   🔍 Looking up IMDB ID: ${id}`);
      const mediaType = type === 'movie' ? 'movie' : 'tv';
      const findUrl = `${config.tmdb.apiUrl}/find/${id}?api_key=${config.tmdb.apiKey}&external_source=imdb_id`;
      
      const findResponse = await fetch(findUrl);
      if (findResponse.ok) {
        const findData = await findResponse.json();
        const results = mediaType === 'movie' ? findData.movie_results : findData.tv_results;
        
        if (results && results.length > 0) {
          posterPath = results[0].poster_path;
          console.log(`   ✅ Found poster path: ${posterPath}`);
        }
      }
    } else if (id.startsWith('tmdb:')) {
      // TMDB ID format
      tmdbId = id.replace('tmdb:', '');
      console.log(`   🔍 Looking up TMDB ID: ${tmdbId}`);
      const mediaType = type === 'movie' ? 'movie' : 'tv';
      const detailUrl = `${config.tmdb.apiUrl}/${mediaType}/${tmdbId}?api_key=${config.tmdb.apiKey}`;
      
      const detailResponse = await fetch(detailUrl);
      if (detailResponse.ok) {
        const detailData = await detailResponse.json();
        posterPath = detailData.poster_path;
        console.log(`   ✅ Found poster path: ${posterPath}`);
      }
    } else {
      // Assume it's a direct TMDB ID
      tmdbId = id;
      console.log(`   🔍 Looking up TMDB ID: ${tmdbId}`);
      const mediaType = type === 'movie' ? 'movie' : 'tv';
      const detailUrl = `${config.tmdb.apiUrl}/${mediaType}/${tmdbId}?api_key=${config.tmdb.apiKey}`;
      
      const detailResponse = await fetch(detailUrl);
      if (detailResponse.ok) {
        const detailData = await detailResponse.json();
        posterPath = detailData.poster_path;
        console.log(`   ✅ Found poster path: ${posterPath}`);
      }
    }
    
    if (!posterPath) {
      console.log(`   ⚠️  No poster found, returning 404`);
      return res.status(404).send('Poster not found');
    }
    
    // Build full TMDB poster URL
    const posterUrl = `${config.tmdb.imageBaseUrl}/w500${posterPath}`;
    
    // Get badged poster from service (with caching)
    const imageBuffer = await posterService.getPosterWithBadge(posterUrl, rankNum, cacheKey);
    
    // Set response headers
    res.set({
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=86400', // 24 hours browser cache
      'Access-Control-Allow-Origin': '*'
    });
    
    res.send(imageBuffer);
  } catch (error) {
    console.error(`   ❌ Error generating poster:`, error.message);
    res.status(500).send('Error generating poster');
  }
});

// Poster cache stats endpoint (for debugging)
app.get('/poster/stats', (req, res) => {
  const stats = posterService.getCacheStats();
  res.json(stats);
});

// Admin endpoint to clear Netflix catalog cache
// Admin endpoint to clear all catalog caches
app.get('/admin/clear-cache', async (req, res) => {
  try {
    const cache = require('./utils/cache');
    
    // Clear all catalog caches
    const cacheKeys = [
      // Netflix Top 10
      'netflix:sweden:movies:top10',
      'netflix:sweden:series:top10',
      // TMDB newly released popular
      'tmdb:movies:newly-released-popular',
      // Trakt recommendations (note: these are per-session, so we clear the pattern)
      'trakt:movies:recommendations',
      'trakt:series:recommendations',
      // Trakt public list
      'trakt:list:leepmc1984:new-movie-releases-digital:popularity,desc:50'
    ];
    
    for (const key of cacheKeys) {
      await cache.clear(key);
    }
    
    res.json({
      success: true,
      message: 'All catalog caches cleared! Next requests will fetch fresh data from APIs.',
      cleared: cacheKeys,
      catalogs: [
        '🆕 Newly Released (TMDB)',
        '🎬 Netflix Sweden Top 10',
        '⭐ Trakt Recommendations (Movies)',
        '📺 Trakt Recommendations (Series)'
      ]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Legacy redirect for old endpoint name
app.get('/admin/clear-netflix-cache', (req, res) => {
  res.redirect(301, '/admin/clear-cache');
});

// =====================================================
// END POSTER ROUTES
// =====================================================

// Mount OAuth routes (web interface)
app.use('/', oauthRouter);

// Mount import API routes
app.use('/', importRouter);

// Mount Stremio addon routes
// Session is passed via query parameter (?session=xxx) and read in handlers via args.extra.session
const addonRouter = getRouter(addonInterface);
app.use('/', addonRouter);

// Export for Vercel serverless
module.exports = app;

// Local development server (only runs if not in Vercel)
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  const port = config.server.port;
  
  app.listen(port, '0.0.0.0', async () => {
    console.log('');
    console.log('🎬 Personalized Catalog');
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

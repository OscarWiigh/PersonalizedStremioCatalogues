const { addonBuilder } = require('stremio-addon-sdk');
const traktService = require('./services/traktService');
const tmdbService = require('./services/tmdbService');
const netflixService = require('./services/netflixService');
const scrobbleService = require('./services/scrobbleService');
const sessionManager = require('./utils/sessionManager');

/**
 * Stremio Add-on Definition (Multi-User)
 * Provides newly released movies (TMDB), Netflix Sweden Top 10, and personalized Trakt recommendations
 */

// Define the add-on manifest
const manifest = {
  id: 'com.stremio.catalog.trakt.netflix.tmdb',
  version: '2.0.0',
  name: 'Personalized Catalog',
  description: 'Newly released movies & shows (TMDB), Netflix Sweden Top 10, and personalized Trakt recommendations.',
  logo: 'https://stremiocatalogues.vercel.app/icon.png',
  
  resources: ['catalog', 'stream'],
  types: ['movie', 'series'],
  // Session in URL path: .../SESSION_ID/manifest.json so we get args.config = SESSION_ID
  config: [{ key: 'session', title: 'Session', type: 'text' }],
  behaviorHints: { configurable: false }, // Session comes from success-page link, not Configure

  catalogs: [
    // Newly Released Movies (TMDB)
    {
      type: 'movie',
      id: 'tmdb-new-releases',
      name: 'Newly Released',
      extra: [{ name: 'skip', isRequired: false }]
    },
    
    // Newly Released Series (TMDB)
    {
      type: 'series',
      id: 'tmdb-new-releases',
      name: 'Newly Released',
      extra: [{ name: 'skip', isRequired: false }]
    },
    
    // Netflix Sweden Top 10 Catalog (Movies Only)
    {
      type: 'movie',
      id: 'netflix-sweden-top10',
      name: 'Netflix Sweden Top 10',
      extra: [{ name: 'skip', isRequired: false }]
    },
    
    // Your Personal Recommendations - Movies
    {
      type: 'movie',
      id: 'trakt-recommendations',
      name: 'Your Personal Recommendations',
      extra: [{ name: 'skip', isRequired: false }]
    },
    
    // Your Personal Recommendations - Series
    {
      type: 'series',
      id: 'trakt-recommendations',
      name: 'Your Personal Recommendations',
      extra: [{ name: 'skip', isRequired: false }]
    }
  ]
};

// Create the add-on builder
const builder = new addonBuilder(manifest);

/**
 * Extract session ID from addon request (URL path config or fallback for dev)
 * When installed via success page URL like .../SESSION_ID/manifest.json, args.config is SESSION_ID
 * @param {object} args - Request args from Stremio SDK ({ type, id, extra, config })
 * @returns {string|null} Session ID
 */
function extractSession(args) {
  const config = args.config;
  if (config != null && typeof config === 'string' && config.length > 0) {
    console.log(`✅ Using session from URL: ${config.substring(0, 8)}...`);
    return config;
  }
  if (config != null && typeof config === 'object' && config.session) {
    console.log(`✅ Using session from config: ${String(config.session).substring(0, 8)}...`);
    return config.session;
  }
  // Fallback: no session in URL (e.g. old install or dev) – Trakt catalogs will need valid session in URL
  console.log('ℹ️  No session in addon URL (install using the link from the success page after logging in)');
  return null;
}

/**
 * Catalog Handler
 * Routes catalog requests to appropriate service (session-aware)
 */
builder.defineCatalogHandler(async (args) => {
  const { type, id, extra = {} } = args;
  const sessionId = extractSession(args);
  const skip = parseInt(extra.skip || 0);
  
  console.log(`📺 Catalog request: type=${type}, id=${id}, skip=${skip}, session=${sessionId ? sessionId.substring(0, 8) + '...' : 'none'}`);
  
  try {
    let metas = [];
    
    // Route to appropriate service based on catalog ID
    switch (id) {
      case 'tmdb-new-releases':
        // TMDB newly released movies/series (no auth needed)
        // Last 30 days (1 month)
        // Sorted by popularity descending (most popular first)
        // Cached for 24 hours, limited to 20 items per page
        if (type === 'movie') {
          metas = await tmdbService.getNewlyReleasedPopular(skip);
        } else if (type === 'series') {
          metas = await tmdbService.getNewlyReleasedPopularSeries(skip);
        }
        break;
        
      case 'trakt-recommendations':
        // Trakt recommendations require authentication
        if (!sessionId) {
          console.warn('⚠️  No session provided for Trakt recommendations, returning empty');
          return { metas: [] };
        }
        
        // Verify session is valid (exists in store – may be expired if Redis cleared or server restarted)
        const isValid = await sessionManager.isValidSession(sessionId);
        if (!isValid) {
          console.warn('⚠️  Invalid session for Trakt recommendations (session not in store – re-authenticate at the addon website to get a new link), returning empty');
          return { metas: [] };
        }
        
        if (type === 'movie') {
          metas = await traktService.getMovieRecommendations(sessionId, skip);
        } else if (type === 'series') {
          metas = await traktService.getSeriesRecommendations(sessionId, skip);
        }
        break;
        
      case 'netflix-sweden-top10':
        // Netflix Top 10 is public, no authentication needed (always 10 items)
        if (type === 'movie') {
          metas = await netflixService.getNetflixTop10Movies();
        }
        break;
        
      default:
        console.warn(`⚠️  Unknown catalog ID: ${id}`);
        return { metas: [] };
    }
    
    console.log(`✅ Returning ${metas.length} items for ${id} (${type})`);
    
    return { metas };
  } catch (error) {
    console.error(`❌ Error handling catalog ${id}:`, error.message);
    return { metas: [] };
  }
});

/**
 * Stream Handler
 * Used to detect when user starts watching content (session-aware for scrobbling)
 * We don't provide actual streams, but use this as a trigger for watch syncing
 */
builder.defineStreamHandler(async (args) => {
  const { type, id } = args;
  const sessionId = extractSession(args);
  
  console.log(`🎬 Stream request: type=${type}, id=${id}, session=${sessionId ? sessionId.substring(0, 8) + '...' : 'none'}`);
  
  // Parse the ID to extract IMDB ID and episode info
  const { imdbId, season, episode } = scrobbleService.parseStremioId(id);
  
  if (imdbId && sessionId) {
    // Mark as watched on Trakt (fire and forget) - requires session
    const isValid = await sessionManager.isValidSession(sessionId);
    if (isValid) {
      scrobbleService.markAsWatched(sessionId, imdbId, type, season, episode)
        .catch(error => {
          console.error('Error marking as watched:', error.message);
        });
    } else {
      console.log('ℹ️  Invalid session, skipping watch sync');
    }
  } else if (!sessionId) {
    console.log('ℹ️  No session provided, skipping watch sync');
  }
  
  // Return empty streams (we don't provide any streams)
  return { streams: [] };
});

module.exports = builder.getInterface();

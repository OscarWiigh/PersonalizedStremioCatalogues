const { addonBuilder } = require('stremio-addon-sdk');
const traktService = require('./services/traktService');
const tmdbService = require('./services/tmdbService');
const netflixService = require('./services/netflixService');
const scrobbleService = require('./services/scrobbleService');
const sessionManager = require('./utils/sessionManager');

/**
 * Stremio Add-on Definition (Multi-User)
 * Provides three catalogs: Trakt Recommendations, Netflix Sweden Top 10, and New & Popular
 */

// Define the add-on manifest
const manifest = {
  id: 'com.stremio.catalog.trakt.netflix.tmdb',
  version: '2.0.0',
  name: 'Personal Catalog',
  description: 'Personalized Trakt recommendations, Netflix Sweden Top 10, and TMDB trending content.',
  
  // In-app configuration - Stremio will show config form automatically
  config: [
    {
      key: "pairCode",
      type: "text",
      title: "Pair Code",
      required: true
    }
  ],
  
  resources: ['catalog', 'stream'],
  types: ['movie', 'series'],
  
  catalogs: [
    // Your Personal Recommendations Catalog
    {
      type: 'movie',
      id: 'trakt-recommendations',
      name: 'Your Personal Recommendations',
      extra: [{ name: 'skip', isRequired: false }]
    },
    {
      type: 'series',
      id: 'trakt-recommendations',
      name: 'Your Personal Recommendations',
      extra: [{ name: 'skip', isRequired: false }]
    },
    
    // Netflix Sweden Top 10 Catalog (Movies Only)
    {
      type: 'movie',
      id: 'netflix-sweden-top10',
      name: 'Netflix Sweden Top 10',
      extra: [{ name: 'skip', isRequired: false }]
    },
    
    // New & Popular Catalog (TMDB)
    {
      type: 'movie',
      id: 'new-and-popular',
      name: 'New & Popular',
      extra: [{ name: 'skip', isRequired: false }]
    },
    {
      type: 'series',
      id: 'new-and-popular',
      name: 'New & Popular',
      extra: [{ name: 'skip', isRequired: false }]
    }
  ]
};

// Create the add-on builder
const builder = new addonBuilder(manifest);

/**
 * Extract session ID from Stremio addon arguments via pair code
 * @param {object} args - Request args from Stremio SDK
 * @returns {Promise<string|null>} Session ID
 */
async function extractSession(args) {
  try {
    // Get pair code from user config
    const pairCode = args.config?.pairCode;
    
    if (!pairCode) {
      return null;
    }
    
    // Look up session ID from pair code
    const sessionId = await sessionManager.getSessionByPairCode(pairCode);
    
    if (sessionId) {
      console.log(`✅ Found session via pair code: ${sessionId.substring(0, 8)}...`);
      return sessionId;
    }
    
    console.log(`⚠️  No session found for pair code: ${pairCode}`);
  } catch (error) {
    console.log('ℹ️  Could not extract session from args:', error.message);
  }
  
  return null;
}

/**
 * Catalog Handler
 * Routes catalog requests to appropriate service (session-aware)
 */
builder.defineCatalogHandler(async (args) => {
  const { type, id, extra } = args;
  const sessionId = await extractSession(args);
  
  console.log(`📺 Catalog request: type=${type}, id=${id}, session=${sessionId ? sessionId.substring(0, 8) + '...' : 'none'}`);
  
  try {
    let metas = [];
    
    // Route to appropriate service based on catalog ID
    switch (id) {
      case 'trakt-recommendations':
        // Trakt recommendations require authentication
        if (!sessionId) {
          console.warn('⚠️  No session provided for Trakt recommendations, returning empty');
          return { metas: [] };
        }
        
        // Verify session is valid
        const isValid = await sessionManager.isValidSession(sessionId);
        if (!isValid) {
          console.warn('⚠️  Invalid session for Trakt recommendations, returning empty');
          return { metas: [] };
        }
        
        if (type === 'movie') {
          metas = await traktService.getMovieRecommendations(sessionId);
        } else if (type === 'series') {
          metas = await traktService.getSeriesRecommendations(sessionId);
        }
        break;
        
      case 'netflix-sweden-top10':
        // Netflix Top 10 is public, no authentication needed
        if (type === 'movie') {
          metas = await netflixService.getNetflixTop10Movies();
        }
        break;
        
      case 'new-and-popular':
        // TMDB is public, no authentication needed
        metas = await tmdbService.getNewAndPopular(type);
        break;
        
      default:
        console.warn(`⚠️  Unknown catalog ID: ${id}`);
        return { metas: [] };
    }
    
    // Apply skip/pagination if provided
    const skip = parseInt(extra?.skip) || 0;
    const limit = 100;
    const paginatedMetas = metas.slice(skip, skip + limit);
    
    console.log(`✅ Returning ${paginatedMetas.length} items for ${id} (${type})`);
    
    return { metas: paginatedMetas };
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
  const sessionId = await extractSession(args);
  
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

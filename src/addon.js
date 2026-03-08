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
  description: 'Trakt trending movies & series, Netflix Sweden Top 10, personal recommendations, and highly rated documentaries.',
  logo: 'https://stremiocatalogues.vercel.app/icon.png',
  
  resources: ['catalog', 'stream'],
  types: ['movie', 'series'],
  catalogs: [
    // 1. Trending (movies) – Trakt
    {
      type: 'movie',
      id: 'trakt-trending',
      name: 'Trending',
      extra: [{ name: 'skip', isRequired: false }]
    },
    // 2. Trending (series) – Trakt
    {
      type: 'series',
      id: 'trakt-trending',
      name: 'Trending',
      extra: [{ name: 'skip', isRequired: false }]
    },
    // 3. Netflix Top 10 Sweden (movies)
    {
      type: 'movie',
      id: 'netflix-sweden-top10',
      name: 'Netflix Top 10 Sweden',
      extra: [{ name: 'skip', isRequired: false }]
    },
    // 4. Your personal recommendations (movies only)
    {
      type: 'movie',
      id: 'trakt-recommendations',
      name: 'Your Personal Recommendations',
      extra: [{ name: 'skip', isRequired: false }]
    },
    // 5. Highly rated documentaries (movies)
    {
      type: 'movie',
      id: 'tmdb-documentaries',
      name: 'Highly Rated Documentaries',
      extra: [{ name: 'skip', isRequired: false }]
    }
  ]
};

// Create the add-on builder
const builder = new addonBuilder(manifest);

/**
 * Extract session ID – hardcoded for now
 * @param {object} args - Request args from Stremio SDK
 * @returns {string|null} Session ID
 */
function extractSession(args) {
  const HARDCODED_SESSION_ID = '1ad4cb50-642d-47e8-912d-c9a3d15e4d43';
  console.log(`✅ Using hardcoded session: ${HARDCODED_SESSION_ID.substring(0, 8)}...`);
  return HARDCODED_SESSION_ID;
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
      case 'trakt-trending':
        // Trakt trending (movies and series), no auth
        if (type === 'movie') {
          metas = await traktService.getTrendingMovies(skip);
        } else if (type === 'series') {
          metas = await traktService.getTrendingSeries(skip);
        }
        break;

      case 'trakt-recommendations':
        // Your personal recommendations (movies only), requires auth
        if (!sessionId) {
          console.warn('⚠️  No session provided for Trakt recommendations, returning empty');
          return { metas: [] };
        }
        const isValid = await sessionManager.isValidSession(sessionId);
        if (!isValid) {
          console.warn('⚠️  Invalid session for Trakt recommendations, returning empty');
          return { metas: [] };
        }
        if (type === 'movie') {
          metas = await traktService.getMovieRecommendations(sessionId, skip);
        }
        break;
        
      case 'netflix-sweden-top10':
        // Netflix Top 10 is public, no authentication needed (always 10 items)
        if (type === 'movie') {
          metas = await netflixService.getNetflixTop10Movies();
        }
        break;

      case 'tmdb-documentaries':
        // Highly Rated Documentaries – Trakt list (shuffled each cache refresh, unwatched only if logged in)
        if (type === 'movie') {
          metas = await traktService.getDocumentaryList(skip, sessionId);
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

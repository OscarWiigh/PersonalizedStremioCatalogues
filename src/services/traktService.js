const fetch = require('node-fetch');
const { config } = require('../config');
const cache = require('../utils/cache');
const tokenManager = require('../utils/tokenManager');

// Helper to get TMDB images and cast
async function getTMDBData(tmdbId, type) {
  if (!tmdbId || !config.tmdb.apiKey) {
    return null;
  }
  
  try {
    const endpoint = type === 'movie' ? 'movie' : 'tv';
    const url = `${config.tmdb.apiUrl}/${endpoint}/${tmdbId}?api_key=${config.tmdb.apiKey}&append_to_response=credits`;
    const response = await fetch(url);
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    
    // Extract cast (top 10 actors)
    let cast = [];
    if (data.credits && data.credits.cast) {
      cast = data.credits.cast
        .slice(0, 10)
        .map(actor => actor.name);
    }
    
    return {
      poster: data.poster_path ? `${config.tmdb.imageBaseUrl}/w500${data.poster_path}` : null,
      background: data.backdrop_path ? `${config.tmdb.imageBaseUrl}/original${data.backdrop_path}` : null,
      cast: cast
    };
  } catch (error) {
    return null;
  }
}

/**
 * Trakt Service
 * Fetches personalized recommendations from Trakt.tv
 */

/**
 * Get Trakt headers with OAuth token
 * @returns {Promise<object>} Headers object
 */
async function getTraktHeaders() {
  const headers = {
    'Content-Type': 'application/json',
    'trakt-api-version': '2'
  };
  
  // Try to get OAuth token
  const token = await tokenManager.getAccessToken();
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  // Also add client ID for API access (from stored tokens or env)
  const tokens = tokenManager.loadTokens();
  const clientId = tokens?.client_id || config.trakt.clientId;
  
  if (clientId) {
    headers['trakt-api-key'] = clientId;
  }
  
  return headers;
}

/**
 * Fetch recommendations for movies
 * @returns {Promise<Array>} Array of movie metadata
 */
async function getMovieRecommendations() {
  const cacheKey = 'trakt:movies:recommendations';
  const cached = await cache.get(cacheKey);
  
  if (cached) {
    console.log('💾 Serving Trakt movie recommendations from cache (Redis)');
    return cached;
  }

  try {
    // Check if user is authenticated
    const isAuth = tokenManager.isAuthenticated();
    if (!isAuth) {
      console.warn('⚠️  Not authenticated with Trakt, using trending instead');
      return getTrendingMovies();
    }

    console.log('🔍 Fetching FRESH Trakt movie recommendations from API...');
    const url = `${config.trakt.apiUrl}/recommendations/movies?limit=50`;
    const headers = await getTraktHeaders();
    console.log(`📡 Trakt URL: ${url}`);
    const response = await fetch(url, { headers });

    if (!response.ok) {
      console.error(`❌ Trakt API error: ${response.status} ${response.statusText}`);
      const errorText = await response.text();
      console.error(`Response: ${errorText}`);
      if (response.status === 401) {
        console.warn('⚠️  Trakt token expired or invalid, falling back to trending');
        return getTrendingMovies();
      }
      throw new Error(`Trakt API error: ${response.status}`);
    }

    const data = await response.json();
    console.log(`✅ Trakt returned ${data.length} movie recommendations (cached for 30 min)`);
    
    // If no recommendations, fall back to trending
    if (data.length === 0) {
      console.warn('⚠️  No personal recommendations found, using trending movies');
      return getTrendingMovies();
    }
    
    const metas = await Promise.all(data.map(item => mapTraktToMeta(item, 'movie')));
    
    await cache.set(cacheKey, metas, config.cache.traktTTL);
    return metas;
  } catch (error) {
    console.error('Error fetching Trakt movie recommendations:', error.message);
    return getTrendingMovies(); // Fallback to trending
  }
}

/**
 * Fetch recommendations for series
 * @returns {Promise<Array>} Array of series metadata
 */
async function getSeriesRecommendations() {
  const cacheKey = 'trakt:series:recommendations';
  const cached = await cache.get(cacheKey);
  
  if (cached) {
    console.log('💾 Serving Trakt series recommendations from cache (Redis)');
    return cached;
  }

  try {
    // Check if user is authenticated
    const isAuth = tokenManager.isAuthenticated();
    if (!isAuth) {
      console.warn('⚠️  Not authenticated with Trakt, using trending instead');
      return getTrendingSeries();
    }

    console.log('🔍 Fetching FRESH Trakt series recommendations from API...');
    const url = `${config.trakt.apiUrl}/recommendations/shows?limit=50`;
    const headers = await getTraktHeaders();
    console.log(`📡 Trakt URL: ${url}`);
    const response = await fetch(url, { headers });

    if (!response.ok) {
      console.error(`❌ Trakt API error: ${response.status} ${response.statusText}`);
      if (response.status === 401) {
        console.warn('⚠️  Trakt token expired or invalid, falling back to trending');
        return getTrendingSeries();
      }
      throw new Error(`Trakt API error: ${response.status}`);
    }

    const data = await response.json();
    console.log(`✅ Trakt returned ${data.length} series recommendations (cached for 30 min)`);
    
    // If no recommendations, fall back to trending
    if (data.length === 0) {
      console.warn('⚠️  No personal recommendations found, using trending series');
      return getTrendingSeries();
    }
    
    const metas = await Promise.all(data.map(item => mapTraktToMeta(item, 'series')));
    
    await cache.set(cacheKey, metas, config.cache.traktTTL);
    return metas;
  } catch (error) {
    console.error('Error fetching Trakt series recommendations:', error.message);
    return getTrendingSeries(); // Fallback to trending
  }
}

/**
 * Fetch trending movies as fallback
 * @returns {Promise<Array>} Array of movie metadata
 */
async function getTrendingMovies() {
  const cacheKey = 'trakt:movies:trending';
  const cached = await cache.get(cacheKey);
  
  if (cached) {
    console.log('💾 Serving Trakt trending movies from cache (Redis)');
    return cached;
  }

  try {
    console.log('🔍 Fetching FRESH Trakt trending movies from API...');
    const url = `${config.trakt.apiUrl}/movies/trending?limit=50`;
    const headers = await getTraktHeaders();
    const response = await fetch(url, { headers });

    if (!response.ok) {
      console.error(`❌ Trakt trending API error: ${response.status} ${response.statusText}`);
      throw new Error(`Trakt API error: ${response.status}`);
    }

    const data = await response.json();
    console.log(`✅ Trakt returned ${data.length} trending movies (cached for 30 min)`);
    const metas = await Promise.all(data.map(item => mapTraktToMeta(item.movie, 'movie')));
    
    await cache.set(cacheKey, metas, config.cache.traktTTL);
    return metas;
  } catch (error) {
    console.error('❌ Error fetching Trakt trending movies:', error.message);
    return [];
  }
}

/**
 * Fetch trending series as fallback
 * @returns {Promise<Array>} Array of series metadata
 */
async function getTrendingSeries() {
  const cacheKey = 'trakt:series:trending';
  const cached = await cache.get(cacheKey);
  
  if (cached) {
    console.log('💾 Serving Trakt trending series from cache (Redis)');
    return cached;
  }

  try {
    console.log('🔍 Fetching FRESH Trakt trending series from API...');
    const url = `${config.trakt.apiUrl}/shows/trending?limit=50`;
    const headers = await getTraktHeaders();
    const response = await fetch(url, { headers });

    if (!response.ok) {
      console.error(`❌ Trakt trending API error: ${response.status} ${response.statusText}`);
      throw new Error(`Trakt API error: ${response.status}`);
    }

    const data = await response.json();
    console.log(`✅ Trakt returned ${data.length} trending series (cached for 30 min)`);
    const metas = await Promise.all(data.map(item => mapTraktToMeta(item.show, 'series')));
    
    await cache.set(cacheKey, metas, config.cache.traktTTL);
    return metas;
  } catch (error) {
    console.error('❌ Error fetching Trakt trending series:', error.message);
    return [];
  }
}

/**
 * Map Trakt data to Stremio meta format
 * @param {object} item - Trakt item
 * @param {string} type - Content type (movie/series)
 * @returns {object} Stremio meta object
 */
async function mapTraktToMeta(item, type) {
  const meta = {
    id: `trakt:${item.ids.trakt}`,
    type: type,
    name: item.title,
    description: item.overview || '',
    releaseInfo: item.year ? item.year.toString() : '',
    imdbRating: item.rating ? item.rating.toFixed(1) : undefined,
  };

  // Get images and cast from TMDB if available
  if (item.ids && item.ids.tmdb) {
    const tmdbData = await getTMDBData(item.ids.tmdb, type);
    if (tmdbData) {
      meta.poster = tmdbData.poster;
      meta.background = tmdbData.background;
      if (tmdbData.cast && tmdbData.cast.length > 0) {
        meta.cast = tmdbData.cast;
      }
    }
  }

  // Use IMDB ID as primary if available
  if (item.ids && item.ids.imdb) {
    meta.id = item.ids.imdb;
  }

  // Add genres if available
  if (item.genres && item.genres.length > 0) {
    meta.genres = item.genres;
  }

  return meta;
}

module.exports = {
  getMovieRecommendations,
  getSeriesRecommendations
};


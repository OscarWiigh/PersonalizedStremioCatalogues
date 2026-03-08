const fetch = require('node-fetch');
const { config } = require('../config');
const cache = require('../utils/cache');
const tokenManager = require('../utils/tokenManager');

// Helper to get TMDB poster and lightweight background (optimized for TV performance)
async function getTMDBData(tmdbId, type) {
  if (!tmdbId || !config.tmdb.apiKey) {
    return null;
  }
  
  try {
    const endpoint = type === 'movie' ? 'movie' : 'tv';
    const url = `${config.tmdb.apiUrl}/${endpoint}/${tmdbId}?api_key=${config.tmdb.apiKey}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    
    return {
      // Use medium poster size for better TV performance (w342 instead of w500)
      poster: data.poster_path ? `${config.tmdb.imageBaseUrl}/w342${data.poster_path}` : null,
      // Use medium backdrop size (w780) for good quality on 4K TVs while staying lightweight (~30-50KB)
      background: data.backdrop_path ? `${config.tmdb.imageBaseUrl}/w780${data.backdrop_path}` : null
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
 * @param {string} [sessionId] - User session ID (optional, for authenticated endpoints)
 * @returns {Promise<object>} Headers object
 */
async function getTraktHeaders(sessionId = null) {
  const headers = {
    'Content-Type': 'application/json',
    'trakt-api-version': '2',
    'trakt-api-key': config.trakt.clientId
  };
  
  // If sessionId provided, try to get OAuth token for this specific session
  if (sessionId) {
    const token = await tokenManager.getAccessToken(sessionId);
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    // Try to use session-specific client ID if available
    const tokens = await tokenManager.loadTokens(sessionId);
    if (tokens?.client_id) {
      headers['trakt-api-key'] = tokens.client_id;
    }
  }
  
  return headers;
}

/**
 * Fetch recommendations for movies
 * @param {string} sessionId - User session ID
 * @param {number} skip - Number of items to skip for pagination (default: 0)
 * @returns {Promise<Array>} Array of movie metadata (max 20 items)
 */
async function getMovieRecommendations(sessionId, skip = 0) {
  const page = Math.floor(skip / 20) + 1; // Calculate page number (20 items per page)
  const cacheKey = `trakt:movies:recommendations:${sessionId}:page${page}`;
  const cached = await cache.get(cacheKey);
  
  if (cached) {
    console.log(`💾 Serving Trakt movie recommendations page ${page} from cache (Redis)`);
    return cached;
  }

  try {
    // Check if user is authenticated
    const isAuth = await tokenManager.isAuthenticated(sessionId);
    if (!isAuth) {
      console.warn('⚠️  Not authenticated with Trakt, using trending instead');
      return getTrendingMovies(skip);
    }

    console.log(`🔍 Fetching FRESH Trakt movie recommendations from API (page ${page})...`);
    // Match website behavior: ignore collected/watchlisted items
    const url = `${config.trakt.apiUrl}/recommendations/movies?extended=full&limit=20&page=${page}&ignore_collected=true&ignore_watchlisted=true`;
    const headers = await getTraktHeaders(sessionId);
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
      return getTrendingMovies(skip);
    }
    
    const metas = await Promise.all(data.map(item => mapTraktToMeta(item, 'movie')));
    
    await cache.set(cacheKey, metas, config.cache.traktTTL);
    return metas;
  } catch (error) {
    console.error('Error fetching Trakt movie recommendations:', error.message);
    return getTrendingMovies(skip); // Fallback to trending
  }
}

/**
 * Fetch recommendations for series
 * @param {string} sessionId - User session ID
 * @param {number} skip - Number of items to skip for pagination (default: 0)
 * @returns {Promise<Array>} Array of series metadata (max 20 items)
 */
async function getSeriesRecommendations(sessionId, skip = 0) {
  const page = Math.floor(skip / 20) + 1; // Calculate page number (20 items per page)
  const cacheKey = `trakt:series:recommendations:${sessionId}:page${page}`;
  const cached = await cache.get(cacheKey);
  
  if (cached) {
    console.log(`💾 Serving Trakt series recommendations page ${page} from cache (Redis)`);
    return cached;
  }

  try {
    // Check if user is authenticated
    const isAuth = await tokenManager.isAuthenticated(sessionId);
    if (!isAuth) {
      console.warn('⚠️  Not authenticated with Trakt, using trending instead');
      return getTrendingSeries(skip);
    }

    console.log(`🔍 Fetching FRESH Trakt series recommendations from API (page ${page})...`);
    // Match website behavior: ignore collected/watchlisted items
    const url = `${config.trakt.apiUrl}/recommendations/shows?extended=full&limit=20&page=${page}&ignore_collected=true&ignore_watchlisted=true`;
    const headers = await getTraktHeaders(sessionId);
    console.log(`📡 Trakt URL: ${url}`);
    const response = await fetch(url, { headers });

    if (!response.ok) {
      console.error(`❌ Trakt API error: ${response.status} ${response.statusText}`);
      if (response.status === 401) {
        console.warn('⚠️  Trakt token expired or invalid, falling back to trending');
        return getTrendingSeries(skip);
      }
      throw new Error(`Trakt API error: ${response.status}`);
    }

    const data = await response.json();
    console.log(`✅ Trakt returned ${data.length} series recommendations (cached for 30 min)`);
    
    // If no recommendations, fall back to trending
    if (data.length === 0) {
      console.warn('⚠️  No personal recommendations found, using trending series');
      return getTrendingSeries(skip);
    }
    
    const metas = await Promise.all(data.map(item => mapTraktToMeta(item, 'series')));
    
    await cache.set(cacheKey, metas, config.cache.traktTTL);
    return metas;
  } catch (error) {
    console.error('Error fetching Trakt series recommendations:', error.message);
    return getTrendingSeries(skip); // Fallback to trending
  }
}

/**
 * Fetch trending movies as fallback
 * @param {number} skip - Number of items to skip for pagination (default: 0)
 * @returns {Promise<Array>} Array of movie metadata (max 20 items)
 */
async function getTrendingMovies(skip = 0) {
  const page = Math.floor(skip / 20) + 1; // Calculate page number (20 items per page)
  const cacheKey = `trakt:movies:trending:page${page}`;
  const cached = await cache.get(cacheKey);
  
  if (cached) {
    console.log(`💾 Serving Trakt trending movies page ${page} from cache (Redis)`);
    return cached;
  }

  try {
    console.log(`🔍 Fetching FRESH Trakt trending movies from API (page ${page})...`);
    const url = `${config.trakt.apiUrl}/movies/trending?extended=full&limit=20&page=${page}`;
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
 * @param {number} skip - Number of items to skip for pagination (default: 0)
 * @returns {Promise<Array>} Array of series metadata (max 20 items)
 */
async function getTrendingSeries(skip = 0) {
  const page = Math.floor(skip / 20) + 1; // Calculate page number (20 items per page)
  const cacheKey = `trakt:series:trending:page${page}`;
  const cached = await cache.get(cacheKey);
  
  if (cached) {
    console.log(`💾 Serving Trakt trending series page ${page} from cache (Redis)`);
    return cached;
  }

  try {
    console.log(`🔍 Fetching FRESH Trakt trending series from API (page ${page})...`);
    const url = `${config.trakt.apiUrl}/shows/trending?extended=full&limit=20&page=${page}`;
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

  // Get poster and background from TMDB if available
  if (item.ids && item.ids.tmdb) {
    const tmdbData = await getTMDBData(item.ids.tmdb, type);
    if (tmdbData) {
      meta.poster = tmdbData.poster;
      meta.background = tmdbData.background;
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

/**
 * Fetch items from a public Trakt list
 * @param {string} username - Trakt username
 * @param {string} listSlug - List slug/ID
 * @param {number} cacheTTL - Optional cache TTL in milliseconds (defaults to 30 min)
 * @param {string} sort - Optional sort parameter (e.g., 'popularity,desc')
 * @param {number} limit - Optional limit for number of items (default: 50)
 * @returns {Promise<Array>} Array of movie metadata
 */
async function getPublicList(username, listSlug, cacheTTL = config.cache.traktTTL, sort = null, limit = 50) {
  const cacheKey = `trakt:list:${username}:${listSlug}${sort ? ':' + sort : ''}:${limit}`;
  const cached = await cache.get(cacheKey);
  
  if (cached) {
    console.log(`💾 Serving Trakt list (${listSlug}) from cache (Redis)`);
    return cached;
  }

  try {
    const cacheHours = Math.floor(cacheTTL / (1000 * 60 * 60));
    console.log(`🔍 Fetching FRESH Trakt list: ${username}/${listSlug} from API...`);
    
    // Build URL with sort and limit parameters
    let url = `${config.trakt.apiUrl}/users/${username}/lists/${listSlug}/items/movie?limit=${limit}`;
    if (sort) {
      url += `&sort=${sort}`;
    }
    
    const headers = await getTraktHeaders();
    console.log(`📡 Trakt List URL: ${url}`);
    const response = await fetch(url, { headers });

    if (!response.ok) {
      console.error(`❌ Trakt API error: ${response.status} ${response.statusText}`);
      throw new Error(`Trakt API error: ${response.status}`);
    }

    const data = await response.json();
    console.log(`✅ Trakt returned ${data.length} items from list${sort ? ' (sorted by ' + sort + ')' : ''} (cached for ${cacheHours}h)`);
    
    // Map list items to metas
    const metas = await Promise.all(data.map(item => {
      // List items have the movie object nested
      const movie = item.movie;
      return mapTraktToMeta(movie, 'movie');
    }));
    
    await cache.set(cacheKey, metas, cacheTTL);
    return metas;
  } catch (error) {
    console.error(`❌ Error fetching Trakt list ${listSlug}:`, error.message);
    return [];
  }
}

// Rotten Tomatoes 100 Best Documentaries (Trakt list by cdtv) – same as catalog "Highly Rated Documentaries"
const DOCUMENTARY_LIST_USER = 'cdtv';
const DOCUMENTARY_LIST_SLUG = 'rotten-tomatoes-100-best-documentaries-ranked-by-tomatometer';
const DOCUMENTARY_LIST_CACHE_TTL = 24 * 60 * 60 * 1000; // 24h
const WATCHED_CACHE_TTL = 10 * 60 * 1000; // 10 min for watched list
const PAGE_SIZE = 20;

/** Fisher-Yates shuffle – new random order each cache cycle */
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Get the set of watched movie IDs for a user (imdb + trakt) for filtering. Cached 10 min.
 * @param {string} sessionId - User session ID (OAuth)
 * @returns {Promise<{ imdb: Set<string>, trakt: Set<string> }>}
 */
async function getWatchedMovieIds(sessionId) {
  const cacheKey = `trakt:watched:movies:${sessionId}`;
  const cached = await cache.get(cacheKey);
  if (cached) {
    return parseWatchedFromCache(cached);
  }
  const headers = await getTraktHeaders(sessionId);
  if (!headers.Authorization) {
    return { imdb: new Set(), trakt: new Set() };
  }
  try {
    const response = await fetch(`${config.trakt.apiUrl}/sync/watched/movies`, { headers });
    if (!response.ok) return { imdb: new Set(), trakt: new Set() };
    const data = await response.json();
    const imdb = new Set();
    const trakt = new Set();
    for (const item of data || []) {
      const m = item.movie || item;
      if (m.ids) {
        if (m.ids.imdb) imdb.add(m.ids.imdb);
        if (m.ids.trakt) trakt.add(String(m.ids.trakt));
      }
    }
    await cache.set(cacheKey, { imdb: [...imdb], trakt: [...trakt] }, WATCHED_CACHE_TTL);
    return { imdb, trakt };
  } catch (err) {
    console.error('❌ Error fetching watched movies:', err.message);
    return { imdb: new Set(), trakt: new Set() };
  }
}

function parseWatchedFromCache(cached) {
  if (!cached) return { imdb: new Set(), trakt: new Set() };
  return {
    imdb: new Set(Array.isArray(cached.imdb) ? cached.imdb : []),
    trakt: new Set(Array.isArray(cached.trakt) ? cached.trakt : [])
  };
}

function isMovieWatched(meta, watched) {
  if (meta.id && meta.id.startsWith('tt')) return watched.imdb.has(meta.id);
  if (meta.id && meta.id.startsWith('trakt:')) return watched.trakt.has(meta.id.replace('trakt:', ''));
  return false;
}

/**
 * Fetch "Highly Rated Documentaries" from Trakt list (Rotten Tomatoes 100 Best Documentaries).
 * Shuffles the list each time the cache refreshes. Optionally filters out movies already watched (if sessionId provided).
 * @param {number} skip - Number of items to skip for pagination (default: 0)
 * @param {string} [sessionId] - User session ID to exclude watched movies (optional)
 * @returns {Promise<Array>} Array of movie metadata (max 20 items per page)
 */
async function getDocumentaryList(skip = 0, sessionId = null) {
  const fullList = await getPublicList(
    DOCUMENTARY_LIST_USER,
    DOCUMENTARY_LIST_SLUG,
    DOCUMENTARY_LIST_CACHE_TTL,
    null,
    100
  );
  const cacheKey = `trakt:documentaries:shuffled:${sessionId || 'anon'}`;
  let list = await cache.get(cacheKey);
  if (!list) {
    let filtered = fullList;
    if (sessionId) {
      const watched = await getWatchedMovieIds(sessionId);
      filtered = fullList.filter(meta => !isMovieWatched(meta, watched));
      console.log(`✅ Documentary list: filtered to ${filtered.length} unwatched (${fullList.length - filtered.length} already watched)`);
    }
    list = shuffleArray(filtered);
    await cache.set(cacheKey, list, DOCUMENTARY_LIST_CACHE_TTL);
  }
  const page = list.slice(skip, skip + PAGE_SIZE);
  console.log(`✅ Documentary list: returning ${page.length} items (skip=${skip}, total=${list.length})`);
  return page;
}

module.exports = {
  getMovieRecommendations,
  getSeriesRecommendations,
  getTrendingMovies,
  getTrendingSeries,
  getPublicList,
  getDocumentaryList
};


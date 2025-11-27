const fetch = require('node-fetch');
const { config } = require('../config');
const cache = require('../utils/cache');

/**
 * TMDB Service
 * Fetches trending and now playing content from The Movie Database
 */

/**
 * Fetch trending movies
 * @returns {Promise<Array>} Array of movie metadata
 */
async function getTrendingMovies() {
  const cacheKey = 'tmdb:movies:trending';
  const cached = await cache.get(cacheKey);
  
  if (cached) {
    return cached;
  }

  try {
    const url = `${config.tmdb.apiUrl}/trending/movie/week?api_key=${config.tmdb.apiKey}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`TMDB API error: ${response.status}`);
    }

    const data = await response.json();
    const metas = await Promise.all(data.results.map(item => mapTMDBToMeta(item, 'movie')));
    
    await cache.set(cacheKey, metas, config.cache.tmdbTTL);
    return metas;
  } catch (error) {
    console.error('Error fetching TMDB trending movies:', error.message);
    return [];
  }
}

/**
 * Fetch trending TV series
 * @returns {Promise<Array>} Array of series metadata
 */
async function getTrendingSeries() {
  const cacheKey = 'tmdb:series:trending';
  const cached = await cache.get(cacheKey);
  
  if (cached) {
    return cached;
  }

  try {
    const url = `${config.tmdb.apiUrl}/trending/tv/week?api_key=${config.tmdb.apiKey}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`TMDB API error: ${response.status}`);
    }

    const data = await response.json();
    const metas = await Promise.all(data.results.map(item => mapTMDBToMeta(item, 'series')));
    
    await cache.set(cacheKey, metas, config.cache.tmdbTTL);
    return metas;
  } catch (error) {
    console.error('Error fetching TMDB trending series:', error.message);
    return [];
  }
}

/**
 * Fetch now playing movies
 * @returns {Promise<Array>} Array of movie metadata
 */
async function getNowPlayingMovies() {
  const cacheKey = 'tmdb:movies:nowplaying';
  const cached = await cache.get(cacheKey);
  
  if (cached) {
    return cached;
  }

  try {
    const url = `${config.tmdb.apiUrl}/movie/now_playing?api_key=${config.tmdb.apiKey}&region=US`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`TMDB API error: ${response.status}`);
    }

    const data = await response.json();
    const metas = await Promise.all(data.results.map(item => mapTMDBToMeta(item, 'movie')));
    
    await cache.set(cacheKey, metas, config.cache.tmdbTTL);
    return metas;
  } catch (error) {
    console.error('Error fetching TMDB now playing movies:', error.message);
    return [];
  }
}

/**
 * Fetch popular TV series
 * @returns {Promise<Array>} Array of series metadata
 */
async function getPopularSeries() {
  const cacheKey = 'tmdb:series:popular';
  const cached = await cache.get(cacheKey);
  
  if (cached) {
    return cached;
  }

  try {
    const url = `${config.tmdb.apiUrl}/tv/popular?api_key=${config.tmdb.apiKey}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`TMDB API error: ${response.status}`);
    }

    const data = await response.json();
    const metas = await Promise.all(data.results.map(item => mapTMDBToMeta(item, 'series')));
    
    await cache.set(cacheKey, metas, config.cache.tmdbTTL);
    return metas;
  } catch (error) {
    console.error('Error fetching TMDB popular series:', error.message);
    return [];
  }
}

/**
 * Get combined "New & Popular" content (trending + now playing)
 * @param {string} type - Content type (movie/series)
 * @returns {Promise<Array>} Array of metadata
 */
async function getNewAndPopular(type) {
  if (type === 'movie') {
    const [trending, nowPlaying] = await Promise.all([
      getTrendingMovies(),
      getNowPlayingMovies()
    ]);
    
    // Combine and deduplicate
    const combined = [...trending, ...nowPlaying];
    const seen = new Set();
    return combined.filter(item => {
      if (seen.has(item.id)) {
        return false;
      }
      seen.add(item.id);
      return true;
    });
  } else if (type === 'series') {
    const [trending, popular] = await Promise.all([
      getTrendingSeries(),
      getPopularSeries()
    ]);
    
    // Combine and deduplicate
    const combined = [...trending, ...popular];
    const seen = new Set();
    return combined.filter(item => {
      if (seen.has(item.id)) {
        return false;
      }
      seen.add(item.id);
      return true;
    });
  }
  
  return [];
}

/**
 * Map TMDB data to Stremio meta format
 * @param {object} item - TMDB item
 * @param {string} type - Content type (movie/series)
 * @returns {Promise<object>} Stremio meta object
 */
async function mapTMDBToMeta(item, type) {
  const title = type === 'movie' ? item.title : item.name;
  const releaseDate = type === 'movie' ? item.release_date : item.first_air_date;
  
  const meta = {
    id: `tmdb:${item.id}`, // Temporary, will be replaced with IMDB ID if available
    type: type,
    name: title,
    // Use medium poster size for better TV performance (w342 instead of w500)
    poster: item.poster_path 
      ? `${config.tmdb.imageBaseUrl}/w342${item.poster_path}`
      : undefined,
    // Background removed - not shown in catalog view, only on detail pages
    description: item.overview || '',
    releaseInfo: releaseDate ? releaseDate.substring(0, 4) : '',
    imdbRating: item.vote_average ? item.vote_average.toFixed(1) : undefined,
  };

  // Add genre IDs if available (these are numeric IDs from TMDB)
  if (item.genre_ids && item.genre_ids.length > 0) {
    meta.genres = item.genre_ids.map(id => getGenreName(id));
  }

  // Fetch IMDB ID only (skip cast for catalog performance)
  // Cast is only needed on detail pages, not in catalog listings
  try {
    const mediaType = type === 'movie' ? 'movie' : 'tv';
    const detailUrl = `${config.tmdb.apiUrl}/${mediaType}/${item.id}?api_key=${config.tmdb.apiKey}&append_to_response=external_ids`;
    const response = await fetch(detailUrl);
    
    if (response.ok) {
      const detailData = await response.json();
      
      // Use IMDB ID as primary ID if available (critical for Stremio compatibility)
      if (detailData.external_ids && detailData.external_ids.imdb_id) {
        meta.id = detailData.external_ids.imdb_id;
      }
    }
  } catch (error) {
    // Fetch failed, continue with tmdb: ID format
    console.warn(`Failed to fetch IMDB ID for TMDB ${item.id}:`, error.message);
  }

  return meta;
}

/**
 * Map TMDB genre IDs to names (simplified mapping)
 * @param {number} id - TMDB genre ID
 * @returns {string} Genre name
 */
function getGenreName(id) {
  const genreMap = {
    28: 'Action',
    12: 'Adventure',
    16: 'Animation',
    35: 'Comedy',
    80: 'Crime',
    99: 'Documentary',
    18: 'Drama',
    10751: 'Family',
    14: 'Fantasy',
    36: 'History',
    27: 'Horror',
    10402: 'Music',
    9648: 'Mystery',
    10749: 'Romance',
    878: 'Science Fiction',
    10770: 'TV Movie',
    53: 'Thriller',
    10752: 'War',
    37: 'Western',
    10759: 'Action & Adventure',
    10762: 'Kids',
    10763: 'News',
    10764: 'Reality',
    10765: 'Sci-Fi & Fantasy',
    10766: 'Soap',
    10767: 'Talk',
    10768: 'War & Politics'
  };
  
  return genreMap[id] || 'Unknown';
}

/**
 * Fetch newly released popular movies (last 30 days)
 * Uses TMDB Discover endpoint with date filtering and popularity sorting
 * Filters for digital and physical releases only
 * @param {number} skip - Number of items to skip for pagination (default: 0)
 * @returns {Promise<Array>} Array of movie metadata sorted by popularity (max 20 items)
 */
async function getNewlyReleasedPopular(skip = 0) {
  const page = Math.floor(skip / 20) + 1; // TMDB pages are 1-indexed, 20 items per page
  const cacheKey = `tmdb:movies:newly-released-popular:page${page}`;
  const cached = await cache.get(cacheKey);
  
  if (cached) {
    console.log(`💾 Serving newly released popular movies page ${page} from cache (Redis)`);
    return cached;
  }

  try {
    // Calculate date range: last 30 days (1 month) dynamically
    const today = new Date();
    const oneMonthAgo = new Date();
    oneMonthAgo.setDate(today.getDate() - 30);
    
    const endDate = today.toISOString().split('T')[0]; // YYYY-MM-DD
    const startDate = oneMonthAgo.toISOString().split('T')[0];
    
    console.log(`🔍 Fetching FRESH newly released popular movies from TMDB (last 30 days: ${startDate} to ${endDate}, page ${page})...`);
    
    // Use discover endpoint with filters matching TMDB's website exactly
    // with_release_type: 4 = Digital, 5 = Physical (Blu-ray/DVD)
    // watch_region=SE: Available in Sweden
    // vote_count.gte=50: At least 50 votes for quality
    // vote_average: 0-10 range
    // with_runtime: 0-400 minutes
    // page: For pagination (20 items per page)
    const url = `${config.tmdb.apiUrl}/discover/movie?api_key=${config.tmdb.apiKey}&sort_by=popularity.desc&release_date.gte=${startDate}&release_date.lte=${endDate}&with_release_type=4|5&vote_count.gte=50&vote_average.gte=0&vote_average.lte=10&with_runtime.gte=0&with_runtime.lte=400&watch_region=SE&page=${page}`;
    
    console.log(`📡 TMDB Discover URL: ${url.replace(config.tmdb.apiKey, 'API_KEY')}`);
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`TMDB API error: ${response.status}`);
    }

    const data = await response.json();
    console.log(`✅ TMDB returned ${data.results.length} newly released movies (digital/physical only, cached for 24h)`);
    
    // TMDB returns 20 items per page by default, perfect for our needs
    const metas = await Promise.all(data.results.map(item => mapTMDBToMeta(item, 'movie')));
    
    // Cache for 24 hours
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    await cache.set(cacheKey, metas, TWENTY_FOUR_HOURS);
    return metas;
  } catch (error) {
    console.error('❌ Error fetching newly released popular movies from TMDB:', error.message);
    return [];
  }
}

module.exports = {
  getTrendingMovies,
  getTrendingSeries,
  getNowPlayingMovies,
  getPopularSeries,
  getNewAndPopular,
  getNewlyReleasedPopular
};


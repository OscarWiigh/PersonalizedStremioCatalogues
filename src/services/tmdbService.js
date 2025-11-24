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
    id: `tmdb:${item.id}`,
    type: type,
    name: title,
    poster: item.poster_path 
      ? `${config.tmdb.imageBaseUrl}/w500${item.poster_path}`
      : undefined,
    background: item.backdrop_path
      ? `${config.tmdb.imageBaseUrl}/original${item.backdrop_path}`
      : undefined,
    description: item.overview || '',
    releaseInfo: releaseDate ? releaseDate.substring(0, 4) : '',
    imdbRating: item.vote_average ? item.vote_average.toFixed(1) : undefined,
  };

  // Add genre IDs if available (these are numeric IDs from TMDB)
  if (item.genre_ids && item.genre_ids.length > 0) {
    meta.genres = item.genre_ids.map(id => getGenreName(id));
  }

  // Fetch cast information
  try {
    const mediaType = type === 'movie' ? 'movie' : 'tv';
    const detailUrl = `${config.tmdb.apiUrl}/${mediaType}/${item.id}?api_key=${config.tmdb.apiKey}&append_to_response=credits`;
    const response = await fetch(detailUrl);
    
    if (response.ok) {
      const detailData = await response.json();
      
      // Extract cast (top 10 actors)
      if (detailData.credits && detailData.credits.cast) {
        meta.cast = detailData.credits.cast
          .slice(0, 10)
          .map(actor => actor.name);
      }
    }
  } catch (error) {
    // Cast fetch failed, continue without it
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

module.exports = {
  getTrendingMovies,
  getTrendingSeries,
  getNowPlayingMovies,
  getPopularSeries,
  getNewAndPopular
};


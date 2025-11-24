const fetch = require('node-fetch');
const { config } = require('../config');

/**
 * Title Matcher Service
 * Matches Netflix titles to TMDB/IMDB IDs
 */

/**
 * Search TMDB for a title
 * @param {string} title - Title to search for
 * @param {number} year - Optional year for better matching
 * @returns {Promise<object|null>} Match result or null
 */
async function searchTMDB(title, year = null) {
  try {
    let url = `${config.tmdb.apiUrl}/search/multi?api_key=${config.tmdb.apiKey}&query=${encodeURIComponent(title)}`;
    
    if (year) {
      url += `&year=${year}`;
    }
    
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error(`TMDB search failed for "${title}": ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    if (!data.results || data.results.length === 0) {
      return null;
    }
    
    // Get the first result (best match)
    const result = data.results[0];
    
    // Get IMDB ID from TMDB
    const imdbId = await getIMDBIdFromTMDB(result.id, result.media_type);
    
    if (!imdbId) {
      console.warn(`No IMDB ID found for TMDB ID ${result.id} (${title})`);
      return null;
    }
    
    return {
      imdbId: imdbId,
      type: result.media_type === 'movie' ? 'movie' : 'series',
      title: result.title || result.name,
      year: result.release_date ? parseInt(result.release_date.split('-')[0]) : 
            result.first_air_date ? parseInt(result.first_air_date.split('-')[0]) : null,
      matchConfidence: calculateMatchConfidence(title, result.title || result.name, year, result.release_date || result.first_air_date)
    };
  } catch (error) {
    console.error(`Error searching TMDB for "${title}":`, error.message);
    return null;
  }
}

/**
 * Get IMDB ID from TMDB ID
 * @param {number} tmdbId - TMDB ID
 * @param {string} mediaType - 'movie' or 'tv'
 * @returns {Promise<string|null>} IMDB ID or null
 */
async function getIMDBIdFromTMDB(tmdbId, mediaType) {
  try {
    const endpoint = mediaType === 'movie' ? 'movie' : 'tv';
    const url = `${config.tmdb.apiUrl}/${endpoint}/${tmdbId}/external_ids?api_key=${config.tmdb.apiKey}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    return data.imdb_id || null;
  } catch (error) {
    console.error(`Error getting IMDB ID for TMDB ${tmdbId}:`, error.message);
    return null;
  }
}

/**
 * Calculate match confidence score
 * @param {string} searchTitle - Original search title
 * @param {string} foundTitle - Found title from TMDB
 * @param {number} searchYear - Search year
 * @param {string} foundDate - Found release date
 * @returns {number} Confidence score 0-100
 */
function calculateMatchConfidence(searchTitle, foundTitle, searchYear, foundDate) {
  let confidence = 0;
  
  // Title similarity (max 70 points)
  const searchLower = searchTitle.toLowerCase().trim();
  const foundLower = (foundTitle || '').toLowerCase().trim();
  
  if (searchLower === foundLower) {
    confidence += 70;
  } else if (foundLower.includes(searchLower) || searchLower.includes(foundLower)) {
    confidence += 50;
  } else {
    // Levenshtein distance-like simple comparison
    const longer = searchLower.length > foundLower.length ? searchLower : foundLower;
    const shorter = searchLower.length > foundLower.length ? foundLower : searchLower;
    const similarity = shorter.length / longer.length;
    confidence += Math.floor(similarity * 40);
  }
  
  // Year matching (max 30 points)
  if (searchYear && foundDate) {
    const foundYear = parseInt(foundDate.split('-')[0]);
    if (searchYear === foundYear) {
      confidence += 30;
    } else if (Math.abs(searchYear - foundYear) <= 1) {
      confidence += 20;
    } else if (Math.abs(searchYear - foundYear) <= 2) {
      confidence += 10;
    }
  } else {
    // No year info, give partial points
    confidence += 15;
  }
  
  return Math.min(confidence, 100);
}

/**
 * Batch search multiple titles
 * @param {array} titles - Array of {title, year} objects
 * @param {function} progressCallback - Called with progress updates
 * @returns {Promise<array>} Array of match results
 */
async function batchSearch(titles, progressCallback = null) {
  const results = [];
  const rateLimit = 40; // TMDB allows 40 requests per 10 seconds
  const delayMs = 250; // 250ms between requests = 4 per second, well under limit
  
  for (let i = 0; i < titles.length; i++) {
    const item = titles[i];
    
    if (progressCallback) {
      progressCallback({
        current: i + 1,
        total: titles.length,
        title: item.title
      });
    }
    
    const match = await searchTMDB(item.title, item.year);
    
    results.push({
      original: item,
      match: match
    });
    
    // Rate limiting delay
    if (i < titles.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  return results;
}

module.exports = {
  searchTMDB,
  batchSearch,
  getIMDBIdFromTMDB
};


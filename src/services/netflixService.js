const fetch = require('node-fetch');
const cheerio = require('cheerio');
const { config } = require('../config');
const cache = require('../utils/cache');

/**
 * Get server base URL for poster endpoint
 * @returns {string} Base URL
 */
function getServerBaseUrl() {
  // Check if we're running on Vercel
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  
  // Check for custom base URL env var
  if (process.env.SERVER_BASE_URL) {
    return process.env.SERVER_BASE_URL;
  }
  
  // Default to localhost for development
  const port = process.env.PORT || 8000;
  return `http://localhost:${port}`;
}

/**
 * Transliterate special characters for better TMDB searches
 * @param {string} text - Text to transliterate
 * @returns {string} Transliterated text
 */
function transliterate(text) {
  const map = {
    'å': 'aa', 'Å': 'Aa',
    'ä': 'ae', 'Ä': 'Ae',
    'ö': 'oe', 'Ö': 'Oe',
    'ü': 'ue', 'Ü': 'Ue',
    'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e',
    'á': 'a', 'à': 'a', 'â': 'a', 'ã': 'a',
    'í': 'i', 'ì': 'i', 'î': 'i', 'ï': 'i',
    'ó': 'o', 'ò': 'o', 'ô': 'o', 'õ': 'o',
    'ú': 'u', 'ù': 'u', 'û': 'u',
    'ñ': 'n', 'ç': 'c', 'ß': 'ss'
  };
  
  return text.split('').map(char => map[char] || char).join('');
}

/**
 * Search TMDB for a title to get metadata
 * Tries multiple variations to handle special characters
 * @param {string} title - Title to search for
 * @param {string} type - Content type (movie/series)
 * @returns {Promise<object|null>} TMDB data or null
 */
async function searchTMDB(title, type) {
  if (!config.tmdb.apiKey) {
    console.warn('⚠️  TMDB API key not configured');
    return null;
  }
  
  const mediaType = type === 'movie' ? 'movie' : 'tv';
  
  // Create multiple search variations
  const cleanTitle = title.replace(/\s+/g, ' ').trim();
  const searchVariations = [
    cleanTitle,                                    // Original title
    transliterate(cleanTitle),                     // Transliterated (ö→oe, ä→ae, etc.)
    cleanTitle.normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remove diacritics
  ];
  
  // Remove duplicates
  const uniqueVariations = [...new Set(searchVariations)];
  
  console.log(`   🔍 Searching TMDB for: "${cleanTitle}" (${mediaType})`);
  
  // Try each variation until we find results
  for (let i = 0; i < uniqueVariations.length; i++) {
    const searchTerm = uniqueVariations[i];
    
    if (i > 0) {
      console.log(`   🔄 Trying variation: "${searchTerm}"`);
    }
    
    try {
      const searchUrl = `${config.tmdb.apiUrl}/search/${mediaType}?api_key=${config.tmdb.apiKey}&query=${encodeURIComponent(searchTerm)}&language=en-US`;
      
      const searchResponse = await fetch(searchUrl);
      if (!searchResponse.ok) {
        continue;
      }
      
      const searchData = await searchResponse.json();
      if (searchData.results && searchData.results.length > 0) {
        // Found results!
        const firstResult = searchData.results[0];
        console.log(`   ✅ Found: ${firstResult.title || firstResult.name}`);
        
        // Fetch full details to get IMDB ID, genres, and cast
        const detailUrl = `${config.tmdb.apiUrl}/${mediaType}/${firstResult.id}?api_key=${config.tmdb.apiKey}&append_to_response=external_ids,credits`;
        const detailResponse = await fetch(detailUrl);
        
        if (!detailResponse.ok) {
          console.warn(`   ⚠️  TMDB details fetch failed, using basic data`);
          return firstResult;
        }
        
        const detailData = await detailResponse.json();
        
        // Add IMDB ID if available
        if (detailData.external_ids && detailData.external_ids.imdb_id) {
          detailData.imdb_id = detailData.external_ids.imdb_id;
          console.log(`   🎬 IMDB ID: ${detailData.imdb_id}`);
        }
        
        // Extract genre names
        if (detailData.genres && detailData.genres.length > 0) {
          detailData.genreNames = detailData.genres.map(g => g.name);
        }
        
        // Extract cast (top 10 actors)
        if (detailData.credits && detailData.credits.cast) {
          detailData.cast = detailData.credits.cast
            .slice(0, 10)
            .map(actor => actor.name);
          console.log(`   🎭 Cast: ${detailData.cast.slice(0, 3).join(', ')}...`);
        }
        
        return detailData;
      }
    } catch (error) {
      console.error(`   ❌ Error with search variation "${searchTerm}":`, error.message);
      continue;
    }
  }
  
  // No results found with any variation
  console.warn(`   ⚠️  No TMDB results for any variation of: "${cleanTitle}"`);
  return null;
}

/**
 * Netflix Service
 * Fetches Netflix Sweden Top 10 data
 * Primary: Netflix Official Top 10 Website (free!)
 * Fallback: FlixPatrol API (if configured)
 */

/**
 * Fetch Netflix Sweden Top 10 movies
 * @returns {Promise<Array>} Array of movie metadata
 */
async function getNetflixTop10Movies() {
  const cacheKey = 'netflix:sweden:movies:top10';
  const cached = await cache.get(cacheKey);
  
  if (cached) {
    console.log('💾 Serving Netflix Top 10 movies from cache (Redis)');
    return cached;
  }

  try {
    console.log('🔍 Fetching FRESH Netflix Top 10 movies from web...');
    const metas = await scrapeNetflixTop10('movie');
    console.log(`✅ Netflix returned ${metas.length} Top 10 movies (cached for 24 hours)`);
    await cache.set(cacheKey, metas, config.cache.netflixTTL);
    return metas;
  } catch (error) {
    console.error('Error fetching Netflix Top 10 movies:', error.message);
    return getFallbackData('movie');
  }
}

/**
 * Fetch Netflix Sweden Top 10 series
 * @returns {Promise<Array>} Array of series metadata
 */
async function getNetflixTop10Series() {
  const cacheKey = 'netflix:sweden:series:top10';
  const cached = await cache.get(cacheKey);
  
  if (cached) {
    console.log('💾 Serving Netflix Top 10 series from cache (Redis)');
    return cached;
  }

  try {
    console.log('🔍 Fetching FRESH Netflix Top 10 series from web...');
    const metas = await scrapeNetflixTop10('series');
    console.log(`✅ Netflix returned ${metas.length} Top 10 series (cached for 24 hours)`);
    await cache.set(cacheKey, metas, config.cache.netflixTTL);
    return metas;
  } catch (error) {
    console.error('Error fetching Netflix Top 10 series:', error.message);
    return getFallbackData('series');
  }
}

/**
 * Scrape Netflix's official Top 10 website (Tudum)
 * Free and official source: https://www.netflix.com/tudum/top10/sweden
 * @param {string} type - Content type (movie/series)
 * @returns {Promise<Array>} Array of metadata
 */
async function scrapeNetflixTop10(type) {
  try {
    const category = type === 'movie' ? 'movies' : 'shows';
    const url = `https://www.netflix.com/tudum/top10/sweden`;
    
    console.log(`🔍 Scraping Netflix Top 10 Sweden ${category}...`);
    console.log(`📡 Netflix URL: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });
    
    if (!response.ok) {
      console.error(`❌ Netflix page error: ${response.status} ${response.statusText}`);
      throw new Error(`Netflix Top 10 page error: ${response.status}`);
    }
    
    const html = await response.text();
    const $ = cheerio.load(html);
    
    console.log(`✅ Netflix page loaded successfully`);
    
    // Extract top 10 items from the page
    // Netflix Tudum uses a table structure with rank, image, title, and weeks
    const top10Items = [];
    
    // Method 1: Extract using image alt text (most reliable)
    $('table tbody tr, table tr').each((index, element) => {
      const $row = $(element);
      
      // Skip if this is a header row
      if ($row.find('th').length > 0) return;
      
      // Try to find the image with alt text (title)
      const $img = $row.find('img').first();
      let title = '';
      
      if ($img.length) {
        title = $img.attr('alt') || $img.attr('title') || '';
      }
      
      // If no image, try to extract text from cells
      if (!title) {
        const $cells = $row.find('td');
        $cells.each((i, cell) => {
          const text = $(cell).text().trim();
          // Look for text that's not just numbers and is long enough to be a title
          if (text && text.length > 3 && !text.match(/^\d+$/) && !title) {
            // Skip if it looks like a week count (e.g., "1" or "22")
            if (!text.match(/^\d{1,2}$/)) {
              title = text;
            }
          }
        });
      }
      
      // Clean up title - remove leading numbers like "01", "02", "1.", "2." etc.
      title = title.replace(/^\d{1,2}\.?\s*/, '').trim();
      
      // Get rank from first cell or use index
      const rankText = $row.find('td').first().text().trim();
      const rank = parseInt(rankText) || (top10Items.length + 1);
      
      // Get weeks from last cell
      const weeksText = $row.find('td').last().text().trim();
      const weeks = weeksText.match(/^\d+$/) ? weeksText : 'N/A';
      
      if (title && title.length > 1) {
        console.log(`   📌 #${rank}: ${title} (${weeks} weeks)`);
        top10Items.push({
          rank: rank,
          title: title,
          weeks: weeks
        });
      }
    });
    
    console.log(`🔍 Extracted ${top10Items.length} items total`);
    
    if (top10Items.length === 0) {
      console.warn('⚠️  Could not parse Netflix Top 10 data from page');
      return getFallbackData(type);
    }
    
    // Filter to max 10 items
    const limitedItems = top10Items.slice(0, 10);
    
    // For each item, try to get TMDB data for better metadata
    console.log(`\n🔍 Enriching ${limitedItems.length} items with TMDB data...\n`);
    
    const metasPromises = limitedItems.map(async (item) => {
      console.log(`\n📌 Processing #${item.rank}: "${item.title}"`);
      
      // Try to find TMDB ID by searching for the title
      const tmdbData = await searchTMDB(item.title, type);
      
      if (tmdbData) {
        // Use TMDB data if found
        const itemId = tmdbData.imdb_id || `tmdb:${tmdbData.id}`;
        const itemType = type === 'movie' ? 'movie' : 'series';
        const baseUrl = getServerBaseUrl();
        
        const meta = {
          id: itemId,
          type: itemType,
          name: tmdbData.title || tmdbData.name || item.title,
          description: tmdbData.overview || `#${item.rank} on Netflix Sweden Top 10`,
          // Use custom poster endpoint with Netflix rank badge
          poster: `${baseUrl}/poster/${itemType}/${item.rank}/${encodeURIComponent(itemId)}.jpg`,
          background: tmdbData.backdrop_path ? `${config.tmdb.imageBaseUrl}/original${tmdbData.backdrop_path}` : undefined,
          genres: tmdbData.genreNames || ['Netflix Top 10', 'Popular'],
          releaseInfo: tmdbData.release_date ? tmdbData.release_date.substring(0, 4) : 
                      tmdbData.first_air_date ? tmdbData.first_air_date.substring(0, 4) : '2024',
          imdbRating: tmdbData.vote_average ? tmdbData.vote_average.toFixed(1) : undefined,
          cast: tmdbData.cast || []
        };
        
        console.log(`   ✅ Enriched with full metadata + Netflix badge`);
        return meta;
      } else {
        // Fallback to basic metadata
        console.warn(`   ⚠️  Using fallback metadata (TMDB not found)`);
        return {
          id: `netflix:se:${item.rank}:${encodeURIComponent(item.title)}`,
          type: type === 'movie' ? 'movie' : 'series',
          name: item.title,
          description: `#${item.rank} on Netflix Sweden Top 10 - ${item.weeks} weeks in top 10`,
          genres: ['Netflix Top 10', 'Popular'],
          releaseInfo: '2024'
        };
      }
    });
    
    const metas = await Promise.all(metasPromises);
    console.log(`\n✅ Successfully enriched ${metas.filter(m => m.poster).length}/${metas.length} items with TMDB data\n`);
    
    console.log(`✅ Returning ${metas.length} Netflix Sweden ${type}s with metadata`);
    
    return metas;
  } catch (error) {
    console.error('❌ Error scraping Netflix Top 10:', error.message);
    console.error('Stack:', error.stack);
    return getFallbackData(type);
  }
}

/**
 * Fallback data with sample titles
 * @param {string} type - Content type
 * @returns {Array} Sample metadata
 */
function getFallbackData(type) {
  // Based on actual Netflix Sweden Top 10 as of Nov 2024
  const movieTitles = [
    'Frankenstein', 'A Merry Little Ex-Mas', 'In Your Dreams', 
    'KPop Demon Hunters', 'Hanna', 'Being Eddie',
    'Lilla spöket Laban spökar igen', 'A HOUSE OF DYNAMITE', 'Twisters'
  ];
  
  const showTitles = [
    'The Beast in Me', 'Squid Game', 'Outer Banks', 
    'The Diplomat', 'The Crown', 'Wednesday'
  ];
  
  const titles = type === 'movie' ? movieTitles : showTitles;
  
  return titles.slice(0, 10).map((title, index) => ({
    id: `netflix:se:fallback:${index + 1}:${encodeURIComponent(title)}`,
    type: type === 'movie' ? 'movie' : 'series',
    name: title,
    description: `#${index + 1} on Netflix Sweden (Sample data - scraping unavailable)`,
    poster: `https://via.placeholder.com/500x750/E50914/FFFFFF?text=Netflix+${index + 1}`,
    genres: ['Netflix Top 10', 'Popular'],
    releaseInfo: '2024'
  }));
}

module.exports = {
  getNetflixTop10Movies,
  getNetflixTop10Series
};


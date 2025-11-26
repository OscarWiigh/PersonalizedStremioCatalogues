const sharp = require('sharp');
const fetch = require('node-fetch');

/**
 * Poster Service
 * Adds Netflix-style rank badges to movie/series posters
 */

// In-memory cache for processed posters
const posterCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Clean expired cache entries
 */
function cleanExpiredCache() {
  const now = Date.now();
  for (const [key, value] of posterCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      posterCache.delete(key);
      console.log(`🧹 Cleaned expired poster cache: ${key}`);
    }
  }
}

/**
 * Get SVG path for a number (0-9)
 * These are bold, thick number paths that work without fonts
 * @param {string} digit - Single digit (0-9)
 * @returns {string} SVG path data
 */
function getNumberPath(digit) {
  // Bold, thick number paths designed for visibility
  // These are scaled to fit in a ~60x80 viewBox
  const paths = {
    '0': 'M30,10 C45,10 50,20 50,40 C50,60 45,70 30,70 C15,70 10,60 10,40 C10,20 15,10 30,10 Z M30,20 C20,20 20,25 20,40 C20,55 20,60 30,60 C40,60 40,55 40,40 C40,25 40,20 30,20 Z',
    '1': 'M25,15 L35,10 L35,70 L45,70 L45,80 L15,80 L15,70 L25,70 Z',
    '2': 'M10,25 C10,15 15,10 30,10 C45,10 50,15 50,25 C50,35 45,40 30,50 L30,60 L50,60 L50,70 L10,70 L10,45 C10,35 15,30 30,20 C40,15 40,15 40,25 C40,30 38,30 30,30 C20,30 20,30 20,25 Z',
    '3': 'M10,20 C10,12 15,10 30,10 C45,10 50,12 50,25 C50,32 47,35 40,37 C47,39 50,42 50,50 C50,63 45,70 30,70 C15,70 10,68 10,60 L20,60 C20,63 22,63 30,63 C38,63 40,63 40,52 C40,45 38,43 30,43 L25,43 L25,37 L30,37 C38,37 40,35 40,27 C40,20 38,18 30,18 C22,18 20,20 20,25 L10,25 Z',
    '4': 'M35,10 L35,50 L45,50 L45,10 L55,10 L55,50 L55,60 L55,70 L45,70 L45,60 L10,60 L10,50 L35,10 Z M25,50 L35,50 L35,28 Z',
    '5': 'M50,10 L50,20 L20,20 L20,35 L30,35 C45,35 50,37 50,50 C50,63 45,70 30,70 C15,70 10,68 10,60 L20,60 C20,63 22,63 30,63 C38,63 40,63 40,52 C40,45 38,43 30,43 C15,43 10,41 10,35 L10,10 Z',
    '6': 'M30,10 C45,10 50,12 50,20 L40,20 C40,17 38,17 30,17 C20,17 20,20 20,30 C23,27 26,25 30,25 C45,25 50,27 50,45 C50,63 45,70 30,70 C15,70 10,63 10,45 L10,25 C10,12 15,10 30,10 Z M30,33 C20,33 20,36 20,47 C20,58 20,62 30,62 C40,62 40,58 40,47 C40,36 40,33 30,33 Z',
    '7': 'M10,10 L50,10 L50,20 L25,70 L15,70 L38,20 L10,20 Z',
    '8': 'M30,10 C45,10 50,13 50,23 C50,30 47,33 40,35 C47,37 50,40 50,48 C50,58 45,70 30,70 C15,70 10,58 10,48 C10,40 13,37 20,35 C13,33 10,30 10,23 C10,13 15,10 30,10 Z M30,18 C22,18 20,20 20,25 C20,30 22,32 30,32 C38,32 40,30 40,25 C40,20 38,18 30,18 Z M30,40 C22,40 20,43 20,50 C20,57 22,62 30,62 C38,62 40,57 40,50 C40,43 38,40 30,40 Z',
    '9': 'M30,10 C45,10 50,17 50,35 L50,55 C50,68 45,70 30,70 C15,70 10,68 10,60 L20,60 C20,63 22,63 30,63 C40,63 40,60 40,50 C37,53 34,55 30,55 C15,55 10,53 10,35 C10,17 15,10 30,10 Z M30,18 C20,18 20,21 20,33 C20,44 20,47 30,47 C40,47 40,44 40,33 C40,21 40,18 30,18 Z'
  };
  return paths[digit] || paths['0'];
}

/**
 * Create a Netflix-style rank badge SVG
 * Bold red rectangle with thick white numbers as SVG paths (no fonts needed)
 * @param {number} rank - Rank number (1-10)
 * @param {number} size - Badge width in pixels
 * @returns {Buffer} SVG buffer
 */
function createBadgeSVG(rank, size = 160) {
  // Rectangle dimensions - wider for double digits
  const width = rank === 10 ? size * 0.9 : size * 0.6;
  const height = size * 0.8;
  
  // Bold Netflix red - no transparency
  const bgColor = 'rgb(229, 9, 20)';
  
  const rankStr = rank.toString();
  const digits = rankStr.split('');
  
  // For single digit, center it
  // For double digit (10), place them side by side
  let numberPaths = '';
  
  if (digits.length === 1) {
    // Single digit - centered
    const path = getNumberPath(digits[0]);
    numberPaths = `<g transform="translate(${width/2 - 30}, ${height/2 - 40})">
      <path d="${path}" fill="white"/>
    </g>`;
  } else {
    // Double digit - side by side
    const path1 = getNumberPath(digits[0]);
    const path2 = getNumberPath(digits[1]);
    const spacing = 8;
    numberPaths = `
      <g transform="translate(${width/2 - 34 - spacing}, ${height/2 - 40})">
        <path d="${path1}" fill="white"/>
      </g>
      <g transform="translate(${width/2 + spacing}, ${height/2 - 40})">
        <path d="${path2}" fill="white"/>
      </g>
    `;
  }
  
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" fill="${bgColor}" rx="4"/>
  ${numberPaths}
</svg>`;
  
  return Buffer.from(svg);
}

/**
 * Add Netflix rank badge to a poster image
 * @param {string} posterUrl - URL of the original poster
 * @param {number} rank - Netflix rank (1-10)
 * @returns {Promise<Buffer>} Processed image as JPEG buffer
 */
async function addBadgeToPoster(posterUrl, rank) {
  try {
    console.log(`🖼️  Processing poster: rank ${rank}, URL: ${posterUrl}`);
    
    // Fetch the original poster
    const response = await fetch(posterUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch poster: ${response.status} ${response.statusText}`);
    }
    
    const imageBuffer = await response.buffer();
    
    // Get image dimensions
    const image = sharp(imageBuffer);
    const metadata = await image.metadata();
    const { width, height } = metadata;
    
    console.log(`   📐 Poster dimensions: ${width}x${height}`);
    
    // Calculate badge size (doubled size - proportional to poster width)
    const badgeSize = Math.min(Math.floor(width * 0.30), 160); // 30% of width, max 160px
    
    // Position badge at TOP-LEFT corner with padding
    const padding = Math.floor(width * 0.03); // 3% padding
    const badgeX = padding;
    const badgeY = padding;
    
    // Create badge SVG
    const badgeSvg = createBadgeSVG(rank, badgeSize);
    
    // Composite badge onto poster
    const processedImage = await image
      .composite([{
        input: badgeSvg,
        top: badgeY,
        left: badgeX
      }])
      .jpeg({ quality: 90 })
      .toBuffer();
    
    console.log(`   ✅ Badge added successfully`);
    
    return processedImage;
  } catch (error) {
    console.error(`   ❌ Error adding badge to poster:`, error.message);
    throw error;
  }
}

/**
 * Get poster with badge (with caching)
 * @param {string} posterUrl - Original poster URL
 * @param {number} rank - Netflix rank (1-10)
 * @param {string} cacheKey - Unique cache key
 * @returns {Promise<Buffer>} Processed image buffer
 */
async function getPosterWithBadge(posterUrl, rank, cacheKey) {
  // Check cache first
  const cached = posterCache.get(cacheKey);
  if (cached) {
    const age = Date.now() - cached.timestamp;
    const ageHours = Math.floor(age / (1000 * 60 * 60));
    
    if (age < CACHE_TTL) {
      console.log(`💾 Serving poster from cache (${ageHours}h old): ${cacheKey}`);
      return cached.buffer;
    } else {
      console.log(`⏰ Cache expired for: ${cacheKey}`);
      posterCache.delete(cacheKey);
    }
  }
  
  // Process fresh image
  console.log(`🔍 Fetching FRESH poster for: ${cacheKey}`);
  const buffer = await addBadgeToPoster(posterUrl, rank);
  
  // Cache the result
  posterCache.set(cacheKey, {
    buffer,
    timestamp: Date.now()
  });
  
  console.log(`   💾 Cached poster (${posterCache.size} items in cache)`);
  
  // Periodically clean expired cache
  if (Math.random() < 0.1) { // 10% chance on each request
    cleanExpiredCache();
  }
  
  return buffer;
}

/**
 * Get cache statistics
 * @returns {object} Cache stats
 */
function getCacheStats() {
  const now = Date.now();
  let validCount = 0;
  let expiredCount = 0;
  
  for (const value of posterCache.values()) {
    if (now - value.timestamp < CACHE_TTL) {
      validCount++;
    } else {
      expiredCount++;
    }
  }
  
  return {
    total: posterCache.size,
    valid: validCount,
    expired: expiredCount,
    ttlHours: CACHE_TTL / (1000 * 60 * 60)
  };
}

module.exports = {
  addBadgeToPoster,
  getPosterWithBadge,
  getCacheStats
};


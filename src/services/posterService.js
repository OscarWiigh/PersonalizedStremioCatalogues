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
 * Get bold SVG path for a single digit (0-9)
 * These are custom-designed bold numbers that look great at any size
 * @param {string} digit - Single digit (0-9)
 * @returns {string} SVG path data
 */
function getNumberSVGPath(digit) {
  // Bold, thick SVG paths for numbers (designed to be ~50x70 units)
  const paths = {
    '0': 'M25,0 C40,0 50,10 50,35 C50,60 40,70 25,70 C10,70 0,60 0,35 C0,10 10,0 25,0 Z M25,12 C18,12 15,17 15,35 C15,53 18,58 25,58 C32,58 35,53 35,35 C35,17 32,12 25,12 Z',
    '1': 'M15,10 L25,0 L35,0 L35,70 L50,70 L50,82 L0,82 L0,70 L20,70 L20,18 Z',
    '2': 'M0,18 C0,7 7,0 25,0 C43,0 50,7 50,18 C50,28 45,33 30,43 L30,58 L50,58 L50,70 L0,70 L0,48 C0,38 5,33 20,23 C33,15 35,13 35,18 C35,23 33,25 25,25 C17,25 15,23 15,18 Z',
    '3': 'M0,15 C0,6 7,0 25,0 C43,0 50,6 50,18 C50,26 47,30 38,33 C47,36 50,40 50,48 C50,62 43,70 25,70 C7,70 0,64 0,55 L15,55 C15,59 17,60 25,60 C33,60 35,59 35,50 C35,44 33,42 25,42 L18,42 L18,33 L25,33 C33,33 35,31 35,23 C35,16 33,14 25,14 C17,14 15,16 15,20 L0,20 Z',
    '4': 'M30,0 L30,45 L40,45 L40,0 L55,0 L55,45 L55,57 L55,70 L40,70 L40,57 L0,57 L0,45 Z M18,45 L30,45 L30,20 Z',
    '5': 'M50,0 L50,14 L15,14 L15,30 L25,30 C43,30 50,32 50,48 C50,62 43,70 25,70 C7,70 0,64 0,55 L15,55 C15,59 17,60 25,60 C33,60 35,59 35,50 C35,44 33,42 25,42 C7,42 0,40 0,30 L0,0 Z',
    '6': 'M25,0 C43,0 50,6 50,15 L35,15 C35,11 33,10 25,10 C15,10 15,13 15,25 C18,22 21,20 25,20 C43,20 50,22 50,42 C50,62 43,70 25,70 C7,70 0,62 0,42 L0,20 C0,6 7,0 25,0 Z M25,30 C15,30 15,33 15,44 C15,55 15,60 25,60 C35,60 35,55 35,44 C35,33 35,30 25,30 Z',
    '7': 'M0,0 L50,0 L50,14 L20,70 L5,70 L33,14 L0,14 Z',
    '8': 'M25,0 C43,0 50,6 50,18 C50,26 47,30 38,33 C47,36 50,40 50,48 C50,62 43,70 25,70 C7,70 0,62 0,48 C0,40 3,36 12,33 C3,30 0,26 0,18 C0,6 7,0 25,0 Z M25,12 C17,12 15,14 15,20 C15,26 17,28 25,28 C33,28 35,26 35,20 C35,14 33,12 25,12 Z M25,38 C17,38 15,41 15,50 C15,59 17,60 25,60 C33,60 35,59 35,50 C35,41 33,38 25,38 Z',
    '9': 'M25,0 C43,0 50,8 50,28 L50,50 C50,64 43,70 25,70 C7,70 0,64 0,55 L15,55 C15,59 17,60 25,60 C35,60 35,57 35,45 C32,48 29,50 25,50 C7,50 0,48 0,28 C0,8 7,0 25,0 Z M25,10 C15,10 15,13 15,26 C15,38 15,40 25,40 C35,40 35,38 35,26 C35,13 35,10 25,10 Z'
  };
  return paths[digit] || paths['0'];
}

/**
 * Create a Netflix-style rank badge SVG
 * Bold red square with thick white numbers as pure SVG paths
 * Fixed size for consistent appearance
 * @param {number} rank - Rank number (1-10)
 * @param {number} size - Badge size in pixels (will be a square)
 * @returns {Buffer} SVG buffer
 */
function createBadgeSVG(rank, size = 160) {
  // Always square, regardless of rank
  const width = size;
  const height = size;
  
  // Bold Netflix red - no transparency
  const bgColor = 'rgb(229, 9, 20)';
  
  const rankStr = rank.toString();
  const digits = rankStr.split('');
  
  // For single digit: scale to 50x70, centered
  // For double digit (10): scale each digit smaller to fit with same margins
  let numberPaths = '';
  
  if (digits.length === 1) {
    // Single digit - centered, large
    const scale = size / 100; // Scale to fit badge
    const numberWidth = 50 * scale;
    const numberHeight = 70 * scale;
    const offsetX = (size - numberWidth) / 2;
    const offsetY = (size - numberHeight) / 2;
    
    const path = getNumberSVGPath(digits[0]);
    numberPaths = `<g transform="translate(${offsetX}, ${offsetY}) scale(${scale})">
      <path d="${path}" fill="white"/>
    </g>`;
  } else {
    // Double digit (10) - side by side, same margins as single digit
    // Each digit is scaled down to fit two digits with proper spacing
    const totalNumberWidth = 50 * 2 + 10; // Two digits + spacing
    const scale = (size * 0.8) / totalNumberWidth; // 80% to maintain margins
    const numberHeight = 70 * scale;
    const spacing = 10 * scale;
    const totalWidth = 50 * scale * 2 + spacing;
    const offsetX = (size - totalWidth) / 2;
    const offsetY = (size - numberHeight) / 2;
    
    const path1 = getNumberSVGPath(digits[0]);
    const path2 = getNumberSVGPath(digits[1]);
    
    numberPaths = `
      <g transform="translate(${offsetX}, ${offsetY}) scale(${scale})">
        <path d="${path1}" fill="white"/>
      </g>
      <g transform="translate(${offsetX + 50 * scale + spacing}, ${offsetY}) scale(${scale})">
        <path d="${path2}" fill="white"/>
      </g>
    `;
  }
  
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" fill="${bgColor}" rx="8"/>
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
    
    // Calculate badge size (SQUARE, doubled size - proportional to poster width)
    const badgeSize = Math.min(Math.floor(width * 0.30), 160); // 30% of width, max 160px (square)
    
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


const sharp = require('sharp');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

/**
 * Poster Service
 * Adds Netflix-style rank badges to movie/series posters
 * Uses embedded Bebas Neue font for crisp text rendering
 */

// In-memory cache for processed posters
const posterCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Load and cache the base64 font at startup
let cachedFontBase64 = null;

/**
 * Get the base64-encoded font data
 * Loads from file once and caches in memory
 * @returns {string} Base64-encoded font data
 */
function getFontBase64() {
  if (cachedFontBase64) {
    return cachedFontBase64;
  }
  
  try {
    const fontPath = path.join(__dirname, '../../fonts/BebasNeue.woff2');
    const fontBuffer = fs.readFileSync(fontPath);
    cachedFontBase64 = fontBuffer.toString('base64');
    console.log('✅ Loaded Bebas Neue font for badge rendering');
    return cachedFontBase64;
  } catch (error) {
    console.error('❌ Failed to load font file:', error.message);
    // Return a fallback - will use system font
    return null;
  }
}

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
 * Create a Netflix-style rank badge SVG
 * Uses embedded Bebas Neue font for crisp text rendering
 * @param {number} rank - Rank number (1-10)
 * @param {number} size - Badge size in pixels (will be a square)
 * @returns {Buffer} SVG buffer
 */
function createBadgeSVG(rank, size = 160) {
  const width = size;
  const height = size;
  
  // Netflix red
  const bgColor = 'rgb(229, 9, 20)';
  
  const rankStr = rank.toString();
  const fontBase64 = getFontBase64();
  
  // Font size: larger for single digit, smaller for double digit
  const fontSize = rankStr.length === 1 ? Math.floor(size * 0.75) : Math.floor(size * 0.55);
  
  // Build the font-face CSS if we have the font
  const fontFaceCSS = fontBase64 
    ? `@font-face {
        font-family: 'BebasNeue';
        src: url('data:font/woff2;base64,${fontBase64}') format('woff2');
        font-weight: normal;
        font-style: normal;
      }`
    : '';
  
  // Use BebasNeue if available, fall back to Impact/Arial Black
  const fontFamily = fontBase64 
    ? "'BebasNeue', Impact, 'Arial Black', sans-serif"
    : "Impact, 'Arial Black', sans-serif";
  
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      ${fontFaceCSS}
      .rank-text {
        font-family: ${fontFamily};
        font-size: ${fontSize}px;
        font-weight: normal;
        fill: white;
        text-anchor: middle;
        dominant-baseline: central;
      }
    </style>
  </defs>
  <rect width="${width}" height="${height}" fill="${bgColor}" rx="8"/>
  <text x="${width / 2}" y="${height / 2}" class="rank-text">${rankStr}</text>
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
    
    // Calculate badge size (proportional to poster width)
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

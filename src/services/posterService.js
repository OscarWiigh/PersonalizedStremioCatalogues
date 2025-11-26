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
 * Create a Netflix-style rank badge SVG
 * Uses sans-serif font which should be available in all environments
 * @param {number} rank - Rank number (1-10)
 * @param {number} size - Badge diameter in pixels
 * @returns {Buffer} SVG buffer
 */
function createBadgeSVG(rank, size = 80) {
  const fontSize = Math.floor(size * 0.55);
  
  // Netflix red with semi-transparency
  const bgColor = 'rgba(229, 9, 20, 0.85)';
  
  // Simple SVG with generic sans-serif font
  const svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <circle cx="${size/2}" cy="${size/2}" r="${size/2}" fill="${bgColor}"/>
  <text x="50%" y="55%" text-anchor="middle" font-size="${fontSize}" font-weight="bold" fill="white" font-family="sans-serif">${rank}</text>
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
    const badgeSize = Math.min(Math.floor(width * 0.15), 80); // 15% of width, max 80px
    
    // Position badge at bottom-left corner with padding
    const padding = Math.floor(width * 0.04); // 4% padding
    const badgeX = padding;
    const badgeY = height - badgeSize - padding;
    
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


const sharp = require('sharp');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

/**
 * Poster Service
 * Adds Netflix-style rank badges to movie/series posters
 * Uses pre-rendered badge images for reliable rendering on Vercel
 */

// In-memory cache for processed posters
const posterCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Cache for badge images (loaded once at startup)
const badgeCache = new Map();

/**
 * Get the pre-rendered badge image buffer
 * @param {number} rank - Rank number (1-10)
 * @returns {Buffer} Badge PNG buffer
 */
function getBadgeBuffer(rank) {
  if (badgeCache.has(rank)) {
    return badgeCache.get(rank);
  }
  
  try {
    const badgePath = path.join(__dirname, '../../public/badges', `${rank}.png`);
    const buffer = fs.readFileSync(badgePath);
    badgeCache.set(rank, buffer);
    console.log(`✅ Loaded badge image for rank ${rank}`);
    return buffer;
  } catch (error) {
    console.error(`❌ Failed to load badge for rank ${rank}:`, error.message);
    throw error;
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
 * Add Netflix rank badge to a poster image
 * Uses pre-rendered badge PNG images for reliable cross-platform rendering
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
    // Pre-rendered badges are 160x160, we'll resize them
    const badgeSize = Math.min(Math.floor(width * 0.30), 160); // 30% of width, max 160px
    
    // Position badge at TOP-LEFT corner with padding
    const padding = Math.floor(width * 0.03); // 3% padding
    const badgeX = padding;
    const badgeY = padding;
    
    // Get pre-rendered badge and resize if needed
    const badgeBuffer = getBadgeBuffer(rank);
    const resizedBadge = await sharp(badgeBuffer)
      .resize(badgeSize, badgeSize)
      .toBuffer();
    
    // Composite badge onto poster
    const processedImage = await image
      .composite([{
        input: resizedBadge,
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

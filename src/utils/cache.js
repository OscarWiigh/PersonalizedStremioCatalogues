/**
 * Cache with Vercel Redis support (falls back to in-memory for local dev)
 */

const { getRedisClient } = require('./redis');

class Cache {
  constructor() {
    this.store = new Map(); // In-memory fallback
  }

  /**
   * Get a value from cache
   * @param {string} key - Cache key
   * @returns {Promise<any|null>} Cached value or null if expired/missing
   */
  async get(key) {
    const redis = await getRedisClient();
    
    if (redis) {
      try {
        const value = await redis.get(key);
        if (value !== null) {
          console.log(`✅ Cache HIT (Redis): ${key}`);
          return JSON.parse(value);
        }
        return null;
      } catch (error) {
        console.error(`❌ Redis get error for ${key}:`, error.message);
        // Fall through to in-memory
      }
    }

    // Fallback to in-memory
    const item = this.store.get(key);
    
    if (!item) {
      return null;
    }

    // Check if expired
    if (Date.now() > item.expiry) {
      this.store.delete(key);
      return null;
    }

    console.log(`✅ Cache HIT (memory): ${key}`);
    return item.value;
  }

  /**
   * Set a value in cache with TTL
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttl - Time to live in milliseconds
   * @returns {Promise<void>}
   */
  async set(key, value, ttl) {
    const redis = await getRedisClient();
    
    if (redis) {
      try {
        // Convert TTL from milliseconds to seconds for Redis
        const ttlSeconds = Math.ceil(ttl / 1000);
        await redis.set(key, JSON.stringify(value), { EX: ttlSeconds });
        console.log(`💾 Cache SET (Redis): ${key} (TTL: ${ttlSeconds}s)`);
        return;
      } catch (error) {
        console.error(`❌ Redis set error for ${key}:`, error.message);
        // Fall through to in-memory cache
      }
    }

    // Fallback to in-memory
    const expiry = Date.now() + ttl;
    this.store.set(key, { value, expiry });
    console.log(`💾 Cache SET (memory): ${key} (TTL: ${ttl / 1000}s)`);
  }

  /**
   * Clear a specific key or entire cache
   * @param {string} [key] - Optional key to clear, or clears all if not provided
   * @returns {Promise<void>}
   */
  async clear(key) {
    const redis = await getRedisClient();
    
    if (redis) {
      try {
        if (key) {
          await redis.del(key);
          console.log(`🗑️  Cache CLEAR (Redis): ${key}`);
        } else {
          // Redis doesn't have a clear-all, so we just log a warning
          console.log('⚠️  Redis clear-all not implemented (would be expensive)');
        }
        return;
      } catch (error) {
        console.error(`❌ Redis clear error:`, error.message);
        // Fall through
      }
    }

    // Fallback to in-memory
    if (key) {
      this.store.delete(key);
      console.log(`🗑️  Cache CLEAR (memory): ${key}`);
    } else {
      this.store.clear();
      console.log('🗑️  Cache CLEAR (memory): All');
    }
  }

  /**
   * Clear all keys matching a pattern
   * @param {string} pattern - Pattern to match (e.g., "trakt:movies:*")
   * @returns {Promise<number>} Number of keys cleared
   */
  async clearPattern(pattern) {
    const redis = await getRedisClient();
    
    if (redis) {
      try {
        // Use Redis SCAN to find matching keys
        const keys = await redis.keys(pattern);
        
        if (keys.length > 0) {
          await redis.del(...keys);
          console.log(`🗑️  Cache CLEAR (Redis): ${keys.length} keys matching "${pattern}"`);
          return keys.length;
        } else {
          console.log(`ℹ️  No Redis keys found matching "${pattern}"`);
          return 0;
        }
      } catch (error) {
        console.error(`❌ Redis clearPattern error:`, error.message);
        // Fall through
      }
    }

    // Fallback to in-memory
    let count = 0;
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    
    for (const key of this.store.keys()) {
      if (regex.test(key)) {
        this.store.delete(key);
        count++;
      }
    }
    
    console.log(`🗑️  Cache CLEAR (memory): ${count} keys matching "${pattern}"`);
    return count;
  }

  /**
   * Get cache statistics
   * @returns {Promise<object>} Cache stats
   */
  async stats() {
    const redis = await getRedisClient();
    
    if (redis) {
      // Redis doesn't provide easy stats, return placeholder
      return {
        type: 'redis',
        message: 'Stats not available for Redis'
      };
    }

    // In-memory stats
    const now = Date.now();
    const entries = Array.from(this.store.entries());
    const valid = entries.filter(([, item]) => now <= item.expiry).length;
    
    return {
      type: 'memory',
      total: entries.length,
      valid,
      expired: entries.length - valid
    };
  }
}

// Export singleton instance
module.exports = new Cache();

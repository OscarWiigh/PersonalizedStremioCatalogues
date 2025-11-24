/**
 * Cache with Vercel KV support (falls back to in-memory for local dev)
 */

let kv = null;
try {
  // Try to import Vercel KV (only available in production or with .env.local)
  kv = require('@vercel/kv').kv;
} catch (error) {
  console.log('ℹ️  Vercel KV not available, using in-memory cache');
}

class Cache {
  constructor() {
    this.store = new Map(); // In-memory fallback
    this.useKV = !!kv;
  }

  /**
   * Get a value from cache
   * @param {string} key - Cache key
   * @returns {Promise<any|null>} Cached value or null if expired/missing
   */
  async get(key) {
    if (this.useKV) {
      try {
        const value = await kv.get(key);
        if (value !== null) {
          console.log(`✅ Cache HIT (KV): ${key}`);
        }
        return value;
      } catch (error) {
        console.error(`❌ KV get error for ${key}:`, error.message);
        return null;
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
    if (this.useKV) {
      try {
        // Convert TTL from milliseconds to seconds for Vercel KV
        const ttlSeconds = Math.ceil(ttl / 1000);
        await kv.set(key, value, { ex: ttlSeconds });
        console.log(`💾 Cache SET (KV): ${key} (TTL: ${ttlSeconds}s)`);
        return;
      } catch (error) {
        console.error(`❌ KV set error for ${key}:`, error.message);
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
    if (this.useKV) {
      try {
        if (key) {
          await kv.del(key);
          console.log(`🗑️  Cache CLEAR (KV): ${key}`);
        } else {
          // KV doesn't have a clear-all, so we just log a warning
          console.log('⚠️  KV clear-all not implemented (would be expensive)');
        }
        return;
      } catch (error) {
        console.error(`❌ KV clear error:`, error.message);
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
   * Get cache statistics
   * @returns {Promise<object>} Cache stats
   */
  async stats() {
    if (this.useKV) {
      // KV doesn't provide easy stats, return placeholder
      return {
        type: 'kv',
        message: 'Stats not available for Vercel KV'
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

/**
 * Simple in-memory cache with TTL support
 */
class Cache {
  constructor() {
    this.store = new Map();
  }

  /**
   * Get a value from cache
   * @param {string} key - Cache key
   * @returns {any|null} Cached value or null if expired/missing
   */
  get(key) {
    const item = this.store.get(key);
    
    if (!item) {
      return null;
    }

    // Check if expired
    if (Date.now() > item.expiry) {
      this.store.delete(key);
      return null;
    }

    console.log(`✅ Cache HIT: ${key}`);
    return item.value;
  }

  /**
   * Set a value in cache with TTL
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttl - Time to live in milliseconds
   */
  set(key, value, ttl) {
    const expiry = Date.now() + ttl;
    this.store.set(key, { value, expiry });
    console.log(`💾 Cache SET: ${key} (TTL: ${ttl / 1000}s)`);
  }

  /**
   * Clear a specific key or entire cache
   * @param {string} [key] - Optional key to clear, or clears all if not provided
   */
  clear(key) {
    if (key) {
      this.store.delete(key);
      console.log(`🗑️  Cache CLEAR: ${key}`);
    } else {
      this.store.clear();
      console.log('🗑️  Cache CLEAR: All');
    }
  }

  /**
   * Get cache statistics
   * @returns {object} Cache stats
   */
  stats() {
    const now = Date.now();
    const entries = Array.from(this.store.entries());
    const valid = entries.filter(([, item]) => now <= item.expiry).length;
    
    return {
      total: entries.length,
      valid,
      expired: entries.length - valid
    };
  }
}

// Export singleton instance
module.exports = new Cache();


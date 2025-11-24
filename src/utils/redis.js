const { createClient } = require('redis');

/**
 * Redis Client for Vercel Redis
 * Automatically connects to Vercel Redis in production, uses null in development
 */

let redisClient = null;
let isConnecting = false;
let connectionPromise = null;

async function getRedisClient() {
  // If we already have a connected client, return it
  if (redisClient && redisClient.isOpen) {
    return redisClient;
  }

  // If we're already connecting, wait for that connection
  if (isConnecting && connectionPromise) {
    return connectionPromise;
  }

  // Check if Redis URL is available (Vercel provides this automatically)
  if (!process.env.REDIS_URL && !process.env.KV_URL) {
    console.log('ℹ️  Redis URL not found, using in-memory fallback');
    return null;
  }

  // Start connecting
  isConnecting = true;
  connectionPromise = (async () => {
    try {
      const redisUrl = process.env.REDIS_URL || process.env.KV_URL;
      redisClient = createClient({
        url: redisUrl,
        socket: {
          connectTimeout: 5000,
          reconnectStrategy: (retries) => {
            if (retries > 10) {
              console.error('❌ Redis connection failed after 10 retries');
              return new Error('Max retries reached');
            }
            return Math.min(retries * 100, 3000);
          }
        }
      });

      redisClient.on('error', (err) => {
        console.error('❌ Redis Client Error:', err.message);
      });

      redisClient.on('connect', () => {
        console.log('✅ Redis Client connected');
      });

      redisClient.on('reconnecting', () => {
        console.log('🔄 Redis Client reconnecting...');
      });

      await redisClient.connect();
      isConnecting = false;
      return redisClient;
    } catch (error) {
      console.error('❌ Error connecting to Redis:', error.message);
      isConnecting = false;
      connectionPromise = null;
      redisClient = null;
      return null;
    }
  })();

  return connectionPromise;
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  if (redisClient && redisClient.isOpen) {
    await redisClient.quit();
    console.log('✅ Redis connection closed');
  }
});

module.exports = {
  getRedisClient
};


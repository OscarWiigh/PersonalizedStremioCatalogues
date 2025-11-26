const fetch = require('node-fetch');
const { config } = require('../config');
const tokenManager = require('../utils/tokenManager');

/**
 * Scrobble Service
 * Syncs watch history to Trakt.tv
 */

/**
 * Mark a movie or episode as watched on Trakt
 * @param {string} sessionId - User session ID
 * @param {string} imdbId - IMDB ID (e.g., 'tt1234567')
 * @param {string} type - Content type ('movie' or 'series')
 * @param {string} [seasonNumber] - Season number for series
 * @param {string} [episodeNumber] - Episode number for series
 * @returns {Promise<boolean>} True if successful
 */
async function markAsWatched(sessionId, imdbId, type, seasonNumber = null, episodeNumber = null) {
  try {
    if (!sessionId) {
      console.log('ℹ️  No session ID provided');
      return false;
    }

    // Check if user is authenticated
    const isAuth = await tokenManager.isAuthenticated(sessionId);
    if (!isAuth) {
      console.log('ℹ️  Not authenticated, skipping watch sync');
      return false;
    }

    const token = await tokenManager.getAccessToken(sessionId);
    if (!token) {
      console.log('ℹ️  No valid token, skipping watch sync');
      return false;
    }

    // Prepare the sync data
    const watchedAt = new Date().toISOString();
    let syncData = {};

    if (type === 'movie') {
      syncData.movies = [{
        ids: { imdb: imdbId },
        watched_at: watchedAt
      }];
      console.log(`📝 Marking movie ${imdbId} as watched on Trakt...`);
    } else if (type === 'series' || type === 'episode') {
      // For series, we need season and episode numbers
      if (!seasonNumber || !episodeNumber) {
        console.warn('⚠️  Season/episode numbers required for series, skipping sync');
        return false;
      }
      
      syncData.episodes = [{
        ids: { imdb: imdbId },
        watched_at: watchedAt
      }];
      console.log(`📝 Marking episode ${imdbId} S${seasonNumber}E${episodeNumber} as watched on Trakt...`);
    } else {
      console.warn(`⚠️  Unknown content type: ${type}, skipping sync`);
      return false;
    }

    // Get client ID for the request
    const tokens = await tokenManager.loadTokens(sessionId);
    const clientId = tokens?.client_id;
    
    if (!clientId) {
      console.error('❌ No client ID found, cannot sync to Trakt');
      return false;
    }
    
    // Send to Trakt
    const response = await fetch('https://api.trakt.tv/sync/history', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'trakt-api-version': '2',
        'trakt-api-key': clientId,
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(syncData)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Failed to sync to Trakt: ${response.status} ${response.statusText}`);
      console.error(`Response: ${errorText}`);
      
      if (response.status === 403) {
        console.error('');
        console.error('⚠️  403 Forbidden - This usually means:');
        console.error('   1. Your Trakt app needs "scrobble" permission enabled');
        console.error('   2. Go to https://trakt.tv/oauth/applications');
        console.error('   3. Edit your app and check the "Scrobble" permission');
        console.error('   4. Re-authenticate at http://localhost:8000');
        console.error('');
      }
      
      return false;
    }

    const result = await response.json();
    
    // Check results
    if (type === 'movie') {
      const added = result.added?.movies || 0;
      if (added > 0) {
        console.log(`✅ Successfully synced movie to Trakt (${added} added)`);
        return true;
      } else {
        console.log('ℹ️  Movie already marked as watched on Trakt');
        return true;
      }
    } else {
      const added = result.added?.episodes || 0;
      if (added > 0) {
        console.log(`✅ Successfully synced episode to Trakt (${added} added)`);
        return true;
      } else {
        console.log('ℹ️  Episode already marked as watched on Trakt');
        return true;
      }
    }
  } catch (error) {
    console.error('❌ Error syncing to Trakt:', error.message);
    return false;
  }
}

/**
 * Parse Stremio ID to extract IMDB ID and episode info
 * @param {string} id - Stremio content ID (e.g., 'tt1234567' or 'tt1234567:1:1')
 * @returns {object} Parsed ID info
 */
function parseStremioId(id) {
  if (!id) {
    return { imdbId: null, season: null, episode: null };
  }

  const parts = id.split(':');
  
  return {
    imdbId: parts[0],
    season: parts[1] ? parseInt(parts[1]) : null,
    episode: parts[2] ? parseInt(parts[2]) : null
  };
}

/**
 * Bulk mark items as watched on Trakt
 * @param {string} sessionId - User session ID
 * @param {array} items - Array of {imdbId, type, watchedAt} objects
 * @param {function} progressCallback - Optional callback for progress updates
 * @returns {Promise<object>} Sync results
 */
async function bulkMarkAsWatched(sessionId, items, progressCallback = null) {
  try {
    if (!sessionId) {
      console.log('ℹ️  No session ID provided');
      return { success: false, error: 'No session ID provided' };
    }

    // Check authentication
    const isAuth = await tokenManager.isAuthenticated(sessionId);
    if (!isAuth) {
      console.log('ℹ️  Not authenticated, skipping bulk sync');
      return { success: false, error: 'Not authenticated' };
    }

    const token = await tokenManager.getAccessToken(sessionId);
    if (!token) {
      console.log('ℹ️  No valid token, skipping bulk sync');
      return { success: false, error: 'No valid token' };
    }

    const tokens = await tokenManager.loadTokens(sessionId);
    const clientId = tokens?.client_id;
    
    if (!clientId) {
      console.error('❌ No client ID found, cannot sync to Trakt');
      return { success: false, error: 'No client ID' };
    }

    // Separate movies and shows
    const movies = [];
    const shows = [];
    
    for (const item of items) {
      const entry = {
        ids: { imdb: item.imdbId }
      };
      
      if (item.watchedAt) {
        entry.watched_at = item.watchedAt;
      }
      
      if (item.type === 'movie') {
        movies.push(entry);
      } else if (item.type === 'series') {
        shows.push(entry);
      }
    }

    console.log(`📦 Bulk syncing ${movies.length} movies and ${shows.length} shows to Trakt...`);

    // Trakt API recommends batches of 100 items max
    const batchSize = 100;
    let totalSynced = 0;
    let totalFailed = 0;
    
    // Batch movies
    for (let i = 0; i < movies.length; i += batchSize) {
      const batch = movies.slice(i, i + batchSize);
      
      if (progressCallback) {
        progressCallback({
          phase: 'syncing',
          current: i + batch.length,
          total: movies.length + shows.length,
          type: 'movies'
        });
      }
      
      const result = await syncBatch({ movies: batch }, token, clientId);
      
      if (result.success) {
        totalSynced += result.added;
      } else {
        totalFailed += batch.length;
      }
      
      // Small delay between batches
      if (i + batchSize < movies.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    // Batch shows
    for (let i = 0; i < shows.length; i += batchSize) {
      const batch = shows.slice(i, i + batchSize);
      
      if (progressCallback) {
        progressCallback({
          phase: 'syncing',
          current: movies.length + i + batch.length,
          total: movies.length + shows.length,
          type: 'shows'
        });
      }
      
      const result = await syncBatch({ shows: batch }, token, clientId);
      
      if (result.success) {
        totalSynced += result.added;
      } else {
        totalFailed += batch.length;
      }
      
      // Small delay between batches
      if (i + batchSize < shows.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log(`✅ Bulk sync complete: ${totalSynced} synced, ${totalFailed} failed`);

    return {
      success: true,
      synced: totalSynced,
      failed: totalFailed,
      total: items.length
    };
  } catch (error) {
    console.error('❌ Error in bulk sync:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Sync a single batch to Trakt
 * @param {object} syncData - Sync data with movies and/or shows
 * @param {string} token - OAuth token
 * @param {string} clientId - Trakt client ID
 * @returns {Promise<object>} Result
 */
async function syncBatch(syncData, token, clientId) {
  try {
    const response = await fetch('https://api.trakt.tv/sync/history', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'trakt-api-version': '2',
        'trakt-api-key': clientId,
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(syncData)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Batch sync failed: ${response.status} ${response.statusText}`);
      console.error(`Response: ${errorText}`);
      return { success: false, added: 0 };
    }

    const result = await response.json();
    const moviesAdded = result.added?.movies || 0;
    const showsAdded = result.added?.shows || 0;
    
    return {
      success: true,
      added: moviesAdded + showsAdded
    };
  } catch (error) {
    console.error('❌ Batch sync error:', error.message);
    return { success: false, added: 0 };
  }
}

module.exports = {
  markAsWatched,
  parseStremioId,
  bulkMarkAsWatched
};


const express = require('express');
const { parseNetflixCSV } = require('../utils/netflixCsvParser');
const { batchSearch } = require('../services/titleMatcher');
const { bulkMarkAsWatched } = require('../services/scrobbleService');

const router = express.Router();

// Store active SSE connections
const activeConnections = new Map();

/**
 * GET /api/import-netflix/progress/:sessionId
 * SSE endpoint for real-time progress updates
 */
router.get('/api/import-netflix/progress/:sessionId', (req, res) => {
  const { sessionId } = req.params;

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Store this connection
  activeConnections.set(sessionId, res);

  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

  // Clean up on disconnect
  req.on('close', () => {
    activeConnections.delete(sessionId);
  });
});

/**
 * POST /api/import-netflix
 * Import Netflix watch history and sync to Trakt
 */
router.post('/api/import-netflix', async (req, res) => {
  const { csvData, sessionId } = req.body;
  
  // Helper function to send SSE updates
  const sendProgress = (data) => {
    const connection = activeConnections.get(sessionId);
    if (connection) {
      connection.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  };
  
  try {
    if (!csvData) {
      return res.status(400).json({
        success: false,
        error: 'No CSV data provided'
      });
    }

    // Parse CSV
    sendProgress({ type: 'parsing', progress: 5, message: 'Parsing CSV file...' });
    
    let parsed;
    try {
      parsed = parseNetflixCSV(csvData);
    } catch (error) {
      sendProgress({ type: 'error', message: `CSV parsing failed: ${error.message}` });
      return res.status(400).json({
        success: false,
        error: `CSV parsing failed: ${error.message}`
      });
    }

    console.log(`📥 Netflix import: ${parsed.total} unique titles to process`);
    sendProgress({ 
      type: 'parsed', 
      progress: 10, 
      message: `Found ${parsed.total} unique titles`,
      total: parsed.total
    });

    // Match titles using TMDB
    const matches = await batchSearch(parsed.items, (progress) => {
      console.log(`🔍 Matching: ${progress.current}/${progress.total} - ${progress.title}`);
      
      // Calculate progress: 10% -> 70% for TMDB matching
      const matchProgress = 10 + Math.floor((progress.current / progress.total) * 60);
      sendProgress({
        type: 'matching',
        progress: matchProgress,
        message: `Matching titles: ${progress.current}/${progress.total}`,
        current: progress.current,
        total: progress.total,
        title: progress.title
      });
    });

    // Filter successful matches
    const matched = matches.filter(m => m.match && m.match.imdbId);
    const skipped = matches.length - matched.length;

    console.log(`✅ Matched ${matched.length} titles, skipped ${skipped}`);
    sendProgress({
      type: 'matched',
      progress: 70,
      message: `Matched ${matched.length} titles`,
      matched: matched.length,
      skipped: skipped
    });

    if (matched.length === 0) {
      sendProgress({ 
        type: 'complete', 
        progress: 100, 
        message: 'No titles could be matched' 
      });
      
      // Close SSE connection
      const connection = activeConnections.get(sessionId);
      if (connection) {
        connection.end();
        activeConnections.delete(sessionId);
      }
      
      return res.json({
        success: true,
        matched: 0,
        synced: 0,
        skipped: parsed.total,
        message: 'No titles could be matched'
      });
    }

    // Prepare items for Trakt sync
    const itemsToSync = matched.map(m => ({
      imdbId: m.match.imdbId,
      type: m.match.type,
      watchedAt: m.original.watchedAt ? new Date(m.original.watchedAt).toISOString() : new Date().toISOString()
    }));

    sendProgress({
      type: 'syncing_start',
      progress: 75,
      message: 'Starting Trakt sync...'
    });

    // Bulk sync to Trakt
    const syncResult = await bulkMarkAsWatched(itemsToSync, (progress) => {
      console.log(`📤 Syncing: ${progress.current}/${progress.total} ${progress.type}`);
      
      // Calculate progress: 75% -> 95% for Trakt syncing
      const syncProgress = 75 + Math.floor((progress.current / progress.total) * 20);
      sendProgress({
        type: 'syncing',
        progress: syncProgress,
        message: `Syncing to Trakt: ${progress.current}/${progress.total}`,
        current: progress.current,
        total: progress.total
      });
    });

    if (!syncResult.success) {
      sendProgress({ 
        type: 'error', 
        message: `Trakt sync failed: ${syncResult.error}` 
      });
      
      // Close SSE connection
      const connection = activeConnections.get(sessionId);
      if (connection) {
        connection.end();
        activeConnections.delete(sessionId);
      }
      
      return res.status(500).json({
        success: false,
        error: `Trakt sync failed: ${syncResult.error}`,
        matched: matched.length,
        synced: 0,
        skipped: skipped
      });
    }

    console.log(`🎉 Import complete: ${syncResult.synced} synced to Trakt`);
    sendProgress({
      type: 'complete',
      progress: 100,
      message: 'Import complete!'
    });
    
    // Close SSE connection
    const connection = activeConnections.get(sessionId);
    if (connection) {
      connection.end();
      activeConnections.delete(sessionId);
    }

    return res.json({
      success: true,
      matched: matched.length,
      synced: syncResult.synced,
      skipped: skipped,
      failed: syncResult.failed || 0
    });

  } catch (error) {
    console.error('❌ Import error:', error.message);
    sendProgress({ 
      type: 'error', 
      message: error.message 
    });
    
    // Close SSE connection
    const connection = activeConnections.get(sessionId);
    if (connection) {
      connection.end();
      activeConnections.delete(sessionId);
    }
    
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;


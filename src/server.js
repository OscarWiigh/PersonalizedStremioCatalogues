#!/usr/bin/env node

const { serveHTTP } = require('stremio-addon-sdk');
const { config, validateConfig } = require('./config');
const addonInterface = require('./addon');

/**
 * Stremio Add-on Server
 * Serves the add-on over HTTP
 */

console.log('');
console.log('🎬 Starting Stremio Catalog Add-on...');
console.log('=====================================');
console.log('');

// Validate configuration
validateConfig();

// Start the server
const port = config.server.port;

serveHTTP(addonInterface, { port: port }).then(() => {
  console.log('');
  console.log('✅ Add-on server is running!');
  console.log('=====================================');
  console.log('');
  console.log(`📍 Server URL: http://localhost:${port}`);
  console.log(`📄 Manifest: http://localhost:${port}/manifest.json`);
  console.log('');
  console.log('📚 Available Catalogs:');
  console.log('   • Your Personal Recommendations (movies & series)');
  console.log('   • Netflix Sweden Top 10 (movies only)');
  console.log('   • New & Popular (movies & series)');
  console.log('');
  console.log('🔧 To install in Stremio:');
  console.log(`   1. Open Stremio`);
  console.log(`   2. Go to Add-ons section`);
  console.log(`   3. Click on "Community Add-ons"`);
  console.log(`   4. Paste this URL: http://localhost:${port}/manifest.json`);
  console.log('');
  console.log('Press Ctrl+C to stop the server');
  console.log('');
}).catch(error => {
  console.error('❌ Failed to start server:', error.message);
  process.exit(1);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('');
  console.log('');
  console.log('👋 Shutting down server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('');
  console.log('👋 Shutting down server...');
  process.exit(0);
});


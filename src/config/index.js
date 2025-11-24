require('dotenv').config();

const config = {
  trakt: {
    // Client ID and Secret are now provided via web UI during OAuth flow
    // These env vars are optional and only needed if you want to pre-configure
    clientId: process.env.TRAKT_CLIENT_ID,
    clientSecret: process.env.TRAKT_CLIENT_SECRET,
    apiUrl: 'https://api.trakt.tv'
  },
  tmdb: {
    apiKey: process.env.TMDB_API_KEY,
    apiUrl: 'https://api.themoviedb.org/3',
    imageBaseUrl: 'https://image.tmdb.org/t/p'
  },
  flixpatrol: {
    apiKey: process.env.FLIXPATROL_API_KEY,
    apiUrl: 'https://api.flixpatrol.com'
  },
  server: {
    port: process.env.PORT || 8000
  },
  cache: {
    traktTTL: 6 * 60 * 60 * 1000, // 6 hours
    tmdbTTL: 2 * 60 * 60 * 1000, // 2 hours
    netflixTTL: 24 * 60 * 60 * 1000 // 24 hours
  }
};

// Validate required configuration
function validateConfig() {
  const required = [
    { key: 'TMDB_API_KEY', value: config.tmdb.apiKey }
  ];

  const missing = required.filter(({ value }) => !value);
  
  if (missing.length > 0) {
    console.warn('⚠️  Missing required environment variables:');
    missing.forEach(({ key }) => console.warn(`   - ${key}`));
    console.warn('Please copy env.template to .env and fill in your API keys.');
  }

  if (!config.flixpatrol.apiKey) {
    console.warn('ℹ️  FLIXPATROL_API_KEY not set. Will use Netflix official API for Top 10.');
  }
  
  console.log('ℹ️  Trakt authentication is handled via OAuth web interface');
}

module.exports = { config, validateConfig };


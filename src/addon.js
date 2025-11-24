const { addonBuilder } = require('stremio-addon-sdk');
const traktService = require('./services/traktService');
const tmdbService = require('./services/tmdbService');
const netflixService = require('./services/netflixService');

/**
 * Stremio Add-on Definition
 * Provides three catalogs: Trakt Recommendations, Netflix Sweden Top 10, and New & Popular
 */

// Define the add-on manifest
const manifest = {
  id: 'com.stremio.catalog.trakt.netflix.tmdb',
  version: '1.0.0',
  name: 'Personal Catalog',
  description: 'Personalized Trakt recommendations, Netflix Sweden Top 10, and TMDB trending content',
  
  resources: ['catalog'],
  types: ['movie', 'series'],
  
  catalogs: [
    // Your Personal Recommendations Catalog
    {
      type: 'movie',
      id: 'trakt-recommendations',
      name: 'Your Personal Recommendations',
      extra: [{ name: 'skip', isRequired: false }]
    },
    {
      type: 'series',
      id: 'trakt-recommendations',
      name: 'Your Personal Recommendations',
      extra: [{ name: 'skip', isRequired: false }]
    },
    
    // Netflix Sweden Top 10 Catalog (Movies Only)
    {
      type: 'movie',
      id: 'netflix-sweden-top10',
      name: 'Netflix Sweden Top 10',
      extra: [{ name: 'skip', isRequired: false }]
    },
    
    // New & Popular Catalog (TMDB)
    {
      type: 'movie',
      id: 'new-and-popular',
      name: 'New & Popular',
      extra: [{ name: 'skip', isRequired: false }]
    },
    {
      type: 'series',
      id: 'new-and-popular',
      name: 'New & Popular',
      extra: [{ name: 'skip', isRequired: false }]
    }
  ]
};

// Create the add-on builder
const builder = new addonBuilder(manifest);

/**
 * Catalog Handler
 * Routes catalog requests to appropriate service
 */
builder.defineCatalogHandler(async ({ type, id, extra }) => {
  console.log(`📺 Catalog request: type=${type}, id=${id}`);
  
  try {
    let metas = [];
    
    // Route to appropriate service based on catalog ID
    switch (id) {
      case 'trakt-recommendations':
        if (type === 'movie') {
          metas = await traktService.getMovieRecommendations();
        } else if (type === 'series') {
          metas = await traktService.getSeriesRecommendations();
        }
        break;
        
      case 'netflix-sweden-top10':
        // Only show movies for Netflix Top 10
        if (type === 'movie') {
          metas = await netflixService.getNetflixTop10Movies();
        }
        break;
        
      case 'new-and-popular':
        metas = await tmdbService.getNewAndPopular(type);
        break;
        
      default:
        console.warn(`⚠️  Unknown catalog ID: ${id}`);
        return { metas: [] };
    }
    
    // Apply skip/pagination if provided
    const skip = parseInt(extra?.skip) || 0;
    const limit = 100;
    const paginatedMetas = metas.slice(skip, skip + limit);
    
    console.log(`✅ Returning ${paginatedMetas.length} items for ${id} (${type})`);
    
    return { metas: paginatedMetas };
  } catch (error) {
    console.error(`❌ Error handling catalog ${id}:`, error.message);
    return { metas: [] };
  }
});

module.exports = builder.getInterface();


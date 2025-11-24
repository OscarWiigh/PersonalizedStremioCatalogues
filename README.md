# Stremio Catalog Add-on

A Stremio catalog add-on that provides personalized content recommendations by integrating:

- **Trakt Recommendations**: Personalized movie and series recommendations based on your Trakt account
- **Netflix Sweden Top 10**: Current top 10 movies and series in Sweden (scraped from Netflix's official free API)
- **New & Popular**: Trending and now playing content from TMDB (The Movie Database)

## Features

- 🎯 Three distinct catalogs with movies and series
- 💾 Smart caching to respect API rate limits
- 🔄 Auto-fallback mechanisms for robust operation
- 🚀 Easy local setup and Stremio integration
- 📊 Real-time trending and personalized recommendations

## Prerequisites

- Node.js 14+ installed
- Stremio application (desktop or mobile)
- API keys from:
  - [Trakt.tv](https://trakt.tv/oauth/applications) (required)
  - [TMDB](https://www.themoviedb.org/settings/api) (required)

## Installation

### Step 1: Clone or Download

Clone this repository or download it to your local machine:

```bash
cd /path/to/stremio-catalog-addon
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Get Your API Keys

#### Trakt API (Required)

1. Go to [https://trakt.tv/oauth/applications](https://trakt.tv/oauth/applications)
2. Click "New Application"
3. Fill in the form:
   - **Name**: Stremio Catalog Add-on (or any name)
   - **Redirect URI**: urn:ietf:wg:oauth:2.0:oob
4. Click "Save App"
5. Copy your **Client ID** and **Client Secret**
6. Note your **Trakt username** (found in your profile URL: trakt.tv/users/YOUR_USERNAME)

#### TMDB API (Required)

1. Go to [https://www.themoviedb.org/settings/api](https://www.themoviedb.org/settings/api)
2. Create an account or log in
3. Request an API key (choose "Developer" option)
4. Fill in the required information
5. Copy your **API Key (v3 auth)**

#### Netflix Top 10 (No API Key Needed!)

Netflix Top 10 data is automatically fetched from Netflix's **official free API**. No additional API key required! 🎉

### Step 4: Configure Environment Variables

Copy the template file and add your API keys:

```bash
cp env.template .env
```

Edit the `.env` file with your API keys:

```env
# Trakt API Configuration
TRAKT_CLIENT_ID=your_actual_trakt_client_id
TRAKT_CLIENT_SECRET=your_actual_trakt_client_secret
TRAKT_USERNAME=your_trakt_username

# TMDB API Configuration
TMDB_API_KEY=your_actual_tmdb_api_key

# Netflix Top 10 - No API key needed! Uses Netflix's free official data

# Server Configuration
PORT=7000
```

## Usage

### Start the Add-on Server

```bash
npm start
```

You should see output like:

```
🎬 Starting Stremio Catalog Add-on...
=====================================

✅ Add-on server is running!
=====================================

📍 Server URL: http://localhost:7000
📄 Manifest: http://localhost:7000/manifest.json

📚 Available Catalogs:
   • Trakt Recommendations (movies & series)
   • Netflix Sweden Top 10 (movies & series)
   • New & Popular (movies & series)

🔧 To install in Stremio:
   1. Open Stremio
   2. Go to Add-ons section
   3. Click on "Community Add-ons"
   4. Paste this URL: http://localhost:7000/manifest.json
```

### Install in Stremio

1. **Open Stremio** on your computer or device
2. **Go to Add-ons** (puzzle icon in the top right)
3. **Scroll down** to find the "Community Add-ons" section
4. **Click the URL field** and paste: `http://localhost:7000/manifest.json`
5. **Press Install**

The add-on should now appear in your Stremio add-ons list!

### Browse Your Catalogs

1. Go to the **Board** or **Discover** section in Stremio
2. You'll see three new catalog sections:
   - **Trakt Recommendations**: Your personalized picks
   - **Netflix Sweden Top 10**: What's trending on Netflix Sweden
   - **New & Popular**: Latest trending content from TMDB

## Project Structure

```
stremio-catalog-addon/
├── src/
│   ├── server.js              # Main server entry point
│   ├── addon.js               # Stremio add-on definition
│   ├── config/
│   │   └── index.js           # Configuration loader
│   ├── services/
│   │   ├── traktService.js    # Trakt API integration
│   │   ├── tmdbService.js     # TMDB API integration
│   │   └── netflixService.js  # Netflix/FlixPatrol integration
│   └── utils/
│       └── cache.js           # Caching utility
├── package.json
├── env.template               # Environment variables template
└── README.md
```

## Caching

The add-on implements intelligent caching to minimize API calls:

- **Trakt data**: Cached for 6 hours
- **TMDB data**: Cached for 2 hours
- **Netflix Top 10**: Cached for 24 hours (updates daily)

Restart the server to clear all caches.

## Troubleshooting

### "Missing required environment variables"

Make sure you've created a `.env` file (copy from `env.template`) and filled in your API keys.

### "Trakt user not found"

Double-check your `TRAKT_USERNAME` matches your actual Trakt profile username (case-sensitive).

### Netflix Top 10 not showing

The add-on fetches data from Netflix's official free API. If it's not working, check:
- Your internet connection
- The server logs for specific error messages
- Netflix's API might be temporarily down (rare)

### Can't connect from Stremio

Make sure:
1. The server is still running (`npm start`)
2. You're using the correct URL: `http://localhost:7000/manifest.json`
3. Your firewall isn't blocking port 7000

### Server won't start

Check if port 7000 is already in use. You can change it in your `.env` file:

```env
PORT=8000
```

## API Rate Limits

Be aware of API rate limits:

- **Trakt**: 1,000 requests per day (free tier)
- **TMDB**: 40 requests per 10 seconds
- **FlixPatrol**: Varies by plan

The built-in caching helps stay well within these limits for normal usage.

## Development

To run in development mode with auto-reload:

```bash
npm run dev
```

## Testing

You can test individual endpoints:

- Manifest: `http://localhost:7000/manifest.json`
- Trakt Movies: `http://localhost:7000/catalog/movie/trakt-recommendations.json`
- TMDB Movies: `http://localhost:7000/catalog/movie/new-and-popular.json`
- Netflix Movies: `http://localhost:7000/catalog/movie/netflix-sweden-top10.json`

## Future Enhancements

Potential improvements for future versions:

- [ ] OAuth flow for Trakt authentication
- [ ] Direct Netflix Top 10 scraping (without FlixPatrol)
- [ ] Configurable catalog names
- [ ] Multiple region support for Netflix
- [ ] Persistent caching (Redis/file-based)
- [ ] User preferences and filtering

## Contributing

Feel free to submit issues or pull requests for improvements!

## License

MIT License

## Disclaimer

This add-on is not affiliated with Trakt, TMDB, Netflix, or FlixPatrol. It uses public APIs to aggregate content information. Make sure to comply with each service's Terms of Service.


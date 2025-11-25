# Personalized Catalog - Stremio Add-on

A Stremio add-on that provides personalized content recommendations by integrating:

- **Trakt Recommendations**: Personalized movie and series recommendations based on your Trakt account
- **Netflix Sweden Top 10**: Current top 10 movies in Sweden (from Netflix's official API)
- **Watch Syncing**: Automatically marks content as watched on Trakt when you watch in Stremio

## Features

- 🎯 Two distinct catalogs with personalized and trending content
- 🔐 Easy OAuth authentication via web interface
- 📝 Automatic watch syncing to Trakt
- 💾 Smart caching to respect API rate limits
- 🔄 Auto-fallback mechanisms for robust operation
- 🚀 Simple local setup and Stremio integration

## Prerequisites

- Node.js 14+ installed
- Stremio application (desktop or mobile)
- A Trakt.tv account (free)
- TMDB API key (free)

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

### Step 3: Get Your TMDB API Key

#### TMDB API (Required)

1. Go to [https://www.themoviedb.org/settings/api](https://www.themoviedb.org/settings/api)
2. Create an account or log in
3. Request an API key (choose "Developer" option)
4. Fill in the required information
5. Copy your **API Key (v3 auth)**

#### Netflix Top 10 (No API Key Needed!)

Netflix Top 10 data is automatically fetched from Netflix's **official free API**. No additional API key required! 🎉

### Step 4: Configure Environment Variables

Copy the template file and add your TMDB API key:

```bash
cp env.template .env
```

Edit the `.env` file:

```env
# TMDB API Configuration
TMDB_API_KEY=your_actual_tmdb_api_key

# Server Configuration
PORT=8000
```

**Note**: Trakt authentication is now handled via OAuth web interface (see next steps).

## Usage

### Step 5: Start the Add-on Server

```bash
npm start
```

You should see output indicating the server is running at `http://localhost:8000`.

### Step 6: Authenticate with Trakt (OAuth)

1. **Open your browser** and navigate to `http://localhost:8000`
2. **Create a Trakt Application**:
   - Click the link or go to [https://trakt.tv/oauth/applications](https://trakt.tv/oauth/applications)
   - Click "New Application"
   - Fill in:
     - **Name**: "My Stremio Catalog" (or any name you prefer)
     - **Redirect URI**: `http://localhost:8000/auth/callback` (⚠️ **CRITICAL**: Must be exact)
     - **Permissions**: Check **"Scrobble"** (required for watch syncing)
   - Click "Save App"
3. **Copy your Client ID and Client Secret** from Trakt
4. **Return to** `http://localhost:8000` and paste them into the form
5. **Click "Authenticate with Trakt"**
6. **Authorize the application** on Trakt.tv when prompted
7. **You'll be redirected back** to a success page showing your addon URL

### Step 7: Install in Stremio

1. **Copy the addon URL** from the success page: `http://localhost:8000/manifest.json`
2. **Open Stremio** on your computer or device
3. **Go to Add-ons** (puzzle icon in the top right)
4. **Scroll down** to "Community Add-ons"
5. **Paste the URL** and click **Install**

The add-on is now active! 🎉

### Step 8: Browse Your Catalogs

1. Go to the **Board** or **Discover** section in Stremio
2. You'll see two new catalog sections:
   - **Your Personal Recommendations**: Your personalized picks from Trakt
   - **Netflix Sweden Top 10**: What's trending on Netflix Sweden

### Automatic Watch Syncing

When you watch content in Stremio through this addon:
- Movies are automatically marked as watched on Trakt
- Your watch history stays in sync
- No manual tracking needed!

## Project Structure

```
stremio-catalog-addon/
├── src/
│   ├── server.js              # Main server with Express
│   ├── addon.js               # Stremio add-on definition
│   ├── config/
│   │   └── index.js           # Configuration loader
│   ├── routes/
│   │   └── oauth.js           # OAuth authentication routes
│   ├── services/
│   │   ├── traktService.js    # Trakt API integration
│   │   ├── tmdbService.js     # TMDB API integration
│   │   ├── netflixService.js  # Netflix integration
│   │   └── scrobbleService.js # Watch syncing to Trakt
│   ├── utils/
│   │   ├── cache.js           # Caching utility
│   │   └── tokenManager.js    # OAuth token management
│   └── views/
│       ├── index.html         # OAuth setup page
│       ├── success.html       # Success page
│       └── error.html         # Error page
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

Make sure you've created a `.env` file (copy from `env.template`) and added your TMDB API key.

### Trakt authentication not working

- Verify the Redirect URI is **exactly**: `http://localhost:8000/auth/callback`
- Make sure you're copying the Client ID and Secret correctly (no extra spaces)
- Check that your Trakt application is active
- Try creating a new Trakt application if problems persist

### Authentication expired

If your Trakt token expires:
1. Navigate to `http://localhost:8000`
2. Click "Check Authentication Status"
3. Re-authenticate if needed

The addon automatically refreshes tokens, but you may need to manually re-authenticate if tokens are invalid.

### Netflix Top 10 not showing

The add-on fetches data from Netflix's official free API. If it's not working, check:
- Your internet connection
- The server logs for specific error messages
- Netflix's API might be temporarily down (rare)

### Can't connect from Stremio

Make sure:
1. The server is still running (`npm start`)
2. You're using the correct URL: `http://localhost:8000/manifest.json`
3. Your firewall isn't blocking port 8000

### Server won't start

Check if port 8000 is already in use. You can change it in your `.env` file:

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

- Web Interface: `http://localhost:8000`
- Auth Status: `http://localhost:8000/auth/status`
- Manifest: `http://localhost:8000/manifest.json`
- Trakt Movies: `http://localhost:8000/catalog/movie/trakt-recommendations.json`
- Netflix Movies: `http://localhost:8000/catalog/movie/netflix-sweden-top10.json`

## Security Notes

- Your Trakt OAuth tokens are stored locally in `.trakt-auth.json`
- Tokens are **never** committed to git (included in `.gitignore`)
- Each user needs to authenticate individually on their own machine
- Tokens can be revoked at any time from your Trakt account settings

## Future Enhancements

Potential improvements for future versions:

- [ ] Configurable catalog names
- [ ] Multiple region support for Netflix
- [ ] Episode-specific watch syncing with progress tracking
- [ ] User preferences and filtering
- [ ] Multi-user support (different users on same machine)

## Contributing

Feel free to submit issues or pull requests for improvements!

## License

MIT License

## Disclaimer

This add-on is not affiliated with Trakt, TMDB, Netflix, or FlixPatrol. It uses public APIs to aggregate content information. Make sure to comply with each service's Terms of Service.


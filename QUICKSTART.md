# Quick Start Guide

Get your Stremio catalog add-on running in 5 minutes!

## 1. Install Dependencies

```bash
npm install
```

## 2. Set Up Environment Variables

```bash
cp env.template .env
```

Then edit `.env` and add your API keys:

### Get Trakt API Key (Required)
- Visit: https://trakt.tv/oauth/applications
- Create new app, copy Client ID and Client Secret
- Add your Trakt username

### Get TMDB API Key (Required)
- Visit: https://www.themoviedb.org/settings/api
- Request API key, copy the API Key (v3)

### Netflix Top 10 (No API Key Needed!)
Netflix Top 10 data works automatically using Netflix's free official API. Nothing to configure! 🎉

## 3. Start the Server

```bash
npm start
```

## 4. Install in Stremio

1. Open Stremio app
2. Go to Add-ons (🧩 icon)
3. Scroll to "Community Add-ons"
4. Paste: `http://localhost:7000/manifest.json`
5. Click Install

## 5. Enjoy!

Your three new catalogs are now available:
- 🎯 Trakt Recommendations
- 📺 Netflix Sweden Top 10
- 🔥 New & Popular

---

Need help? Check the full [README.md](README.md) for detailed instructions and troubleshooting.


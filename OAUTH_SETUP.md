# Trakt OAuth Setup Guide

## Quick Start

This addon now uses OAuth for Trakt authentication. Here's how to set it up:

### 1. Start the Server

```bash
npm start
```

The server will start and display a URL (e.g., `http://localhost:8000` or your configured port).

### 2. Open Web Interface

Navigate to the URL shown in your browser (e.g., `http://localhost:8000`)

### 3. Create Trakt Application

1. Go to [https://trakt.tv/oauth/applications](https://trakt.tv/oauth/applications)
2. Click **"New Application"**
3. Fill in the form:
   - **Name**: "My Stremio Catalog" (or any name you prefer)
   - **Description**: Optional
   - **Redirect URI**: `http://localhost:YOUR_PORT/auth/callback`
     - Replace `YOUR_PORT` with your configured port (shown in the web interface)
     - ⚠️ **This MUST match exactly** or authentication will fail!
   - **Permissions**: **Check "Scrobble"** (REQUIRED for watch syncing)
4. Click **"Save App"**

### 4. Authenticate

1. Copy your **Client ID** and **Client Secret** from Trakt
2. Return to the web interface (`http://localhost:YOUR_PORT`)
3. Paste your credentials into the form
4. Click **"Authenticate with Trakt"**
5. Authorize the application when redirected to Trakt.tv
6. You'll be redirected back to a success page

### 5. Install in Stremio

1. Copy the addon URL from the success page: `http://localhost:YOUR_PORT/manifest.json`
2. Open Stremio
3. Go to Add-ons (puzzle icon)
4. Scroll to "Community Add-ons"
5. Paste the URL and click Install

## Features

### Personal Recommendations
Once authenticated, you'll get personalized movie and series recommendations based on your Trakt watch history.

### Automatic Watch Syncing
When you watch content in Stremio:
- Movies are automatically marked as watched on Trakt
- Your watch history stays synchronized
- No manual tracking needed

## Troubleshooting

### Redirect URI Mismatch
**Error**: "redirect_uri mismatch"

**Solution**: Make sure the Redirect URI in your Trakt application settings **exactly** matches:
```
http://localhost:YOUR_PORT/auth/callback
```

If you change the PORT in your `.env` file, you must also update it in your Trakt application settings.

### Authentication Expired
If your token expires:
1. Visit `http://localhost:YOUR_PORT`
2. Click "Check Authentication Status"
3. Re-authenticate if needed

Tokens are automatically refreshed, but occasionally you may need to manually re-authenticate.

### Not Seeing Personal Recommendations
If you only see trending content instead of personalized recommendations:
1. Check authentication status at `http://localhost:YOUR_PORT/auth/status`
2. Make sure you've watched and rated content on Trakt
3. Trakt needs some watch history to generate recommendations

### Port Already in Use
If port 8000 is already in use, create a `.env` file:

```bash
cp env.template .env
```

Edit `.env` and change the port:
```
PORT=8000
```

**Important**: After changing the port, update your Trakt application's Redirect URI to match!

## Security

- Your OAuth tokens are stored locally in `.trakt-auth.json`
- This file is automatically excluded from git
- Tokens can be revoked at any time from your Trakt account settings
- Each user needs to authenticate individually on their own machine

## Technical Details

### Token Storage
Tokens are stored in `.trakt-auth.json` in the project root. This file contains:
- Access token
- Refresh token
- Expiration timestamp
- Client credentials

### Automatic Token Refresh
The addon automatically refreshes your access token before it expires. You shouldn't need to re-authenticate unless:
- You manually delete `.trakt-auth.json`
- Your refresh token expires (very rare)
- You revoke access from your Trakt account

### Watch Syncing
The addon uses Stremio's stream handler to detect when you start watching content. It then:
1. Extracts the IMDB ID from the content
2. Sends a sync request to Trakt's history endpoint
3. Marks the content as watched with the current timestamp

This happens automatically in the background without any user interaction.

## Support

If you encounter issues:
1. Check the server console for error messages
2. Visit `/auth/status` to check authentication state
3. Try re-authenticating from the web interface
4. Check that your Trakt application is active
5. Verify the Redirect URI matches exactly


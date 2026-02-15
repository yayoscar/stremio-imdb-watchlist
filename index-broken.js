require('dotenv').config();
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');
const cheerio = require('cheerio');
const express = require('express');
const path = require('path');
const fs = require('fs');

// Load configuration from environment variables (fallback values)
const envConfig = {
    maxItems: parseInt(process.env.MAX_ITEMS) || 8,
    port: parseInt(process.env.PORT) || 7000,
    omdbApiKey: process.env.OMDB_API_KEY,
    tmdbApiKey: process.env.TMDB_API_KEY,
    tmdbLanguage: process.env.TMDB_LANGUAGE || 'es',
    baseUrlTmdb: "https://image.tmdb.org/t/p/",
    defaultImdbUserId: process.env.IMDB_USER_ID || 'ur27472448'
};

// Validate required environment variables
if (!envConfig.omdbApiKey) {
    console.error('ERROR: OMDB_API_KEY is required. Set it in .env file.');
    process.exit(1);
}

if (!envConfig.tmdbApiKey) {
    console.error('ERROR: TMDB_API_KEY is required. Set it in .env file.');
    process.exit(1);
}

// Load base manifest.json
const manifestPath = __dirname + '/manifest.json';
let baseManifest;

try {
    baseManifest = JSON.parse(fs.readFileSync(manifestPath));
} catch (error) {
    console.error('ERROR: Could not read manifest.json:', error.message);
    process.exit(1);
}

// Express app - will serve all routes including addon endpoints
const app = express();

// Serve static files (including configure page)
app.use(express.static(__dirname + '/static'));

// Helper function to build user-specific manifest
function buildManifest(userId) {
    return {
        ...baseManifest,
        name: `IMDb Watchlist (${userId})`,
        description: `Watchlist for IMDb user: ${userId}`
    };
}

// Function to extract user ID from URL path
// Format expected: http://domain.com/:userId/...
function extractUserIdFromPath(path) {
    const parts = path.split('/').filter(p => p && p.length > 0);
    // The user ID should be the first path component (after domain/before /manifest.json)
    if (parts.length > 0 && parts[0] !== 'manifest.json') {
        return parts[0];
    }
    return envConfig.defaultImdbUserId;
}

// Get addon interface from SDK
const addonInterface = addonBuilder(baseManifest).getInterface();

// Serve SDK addon routes through Express
// The SDK expects requests like /catalog/movie/id or /resource/type/id
app.use(addonInterface);

// Override manifest routes with user-specific ones
app.get('/:userParam/manifest.json', (req, res) => {
    const userProfileId = req.params.userParam;
    console.log(`[Manifest] Serving manifest for user: ${userProfileId}`);
    res.json(buildManifest(userProfileId));
});

app.get('/manifest.json', (req, res) => {
    console.log(`[Manifest] Serving default manifest with user ID: ${envConfig.defaultImdbUserId}`);
    res.json(buildManifest(envConfig.defaultImdbUserId));
});

// Middleware to extract user ID from URL and pass it to the catalog handler
app.use((req, res, next) => {
    // Extract user ID from path for catalog requests
    // Path format: /userId/catalog/movie/id.json
    const pathParts = req.path.split('/');
    const userId = extractUserIdFromPath(req.path);
    
    if (userId !== envConfig.defaultImdbUserId) {
        console.log(`[Router] Routing request for user: ${userId}`);
        // Temporarily set the user ID for this request
        req.userProfileId = userId;
    } else {
        req.userProfileId = envConfig.defaultImdbUserId;
    }
    next();
});

// Create builder instance with base manifest
const builder = new addonBuilder(baseManifest);

// Catalog handler - reads user ID from request
builder.defineCatalogHandler(async (args) => {
    const startTime = Date.now();
    
    // Use the user ID from the Express middleware
    const imdbUserId = args.userProfileId || envConfig.defaultImdbUserId;
        const response = await axios.get(IMDB_WATCHLIST_URL, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': 'https://www.google.com/'
            }
        });

        const html = response.data;
        const $ = cheerio.load(html);

        // Array para almacenar los metadatos
        const metas = [];
        const elements = $('li.ipc-metadata-list-summary-item').toArray();

        console.log(`[Catalog] Found ${elements.length} items in watchlist`);

        // Process each element
        for (const element of elements) {
            // Aplicar skip y limitar a maxItems
            if (metas.length >= envConfig.maxItems) break;

            // Extract IMDb ID from link
            const linkElement = $(element).find('a.ipc-lockup-overlay');
            const imdbId = linkElement.attr('href')?.match(/\/title\/(tt\d+)\//)?.[1];

            if (!imdbId) {
                console.warn(`[Catalog] Could not extract IMDb ID from element`);
                continue;
            }

            try {
                // Fetch data from OMDB
                const omdbUrl = `https://www.omdbapi.com/?i=${imdbId}&apikey=${envConfig.omdbApiKey}&plot=full`;
                const omdbResponse = await axios.get(omdbUrl);
                const omdbData = omdbResponse.data;

                // Only process movies
                if (omdbData.Type !== 'movie') {
                    console.log(`[Catalog] Skipping ${imdbId} - not a movie (type: ${omdbData.Type})`);
                    continue;
                }

                // Fetch additional data from TMDB
                let tmdbMovie = null;
                try {
                    const tmdbResponse = await axios.get(
                        `https://api.themoviedb.org/3/find/${imdbId}?external_source=imdb_id&language=${envConfig.tmdbLanguage}`,
                        {
                            headers: {
                                'Authorization': `Bearer ${envConfig.tmdbApiKey}`,
                            },
                        }
                    );
                    tmdbMovie = tmdbResponse.data.movie_results?.[0];
                } catch (tmdbError) {
                    console.warn(`[Catalog] Warning: Could not fetch TMDB data for ${imdbId}:`, tmdbError.message);
                }

                // Build meta object
                const meta = {
                    id: imdbId,
                    name: omdbData.Title,
                    type: omdbData.Type,
                    year: tmdbMovie?.release_date?.split('-')[0] || omdbData.Year,
                    poster: omdbData.Poster !== 'N/A' ? omdbData.Poster : null,
                    imdbRating: parseFloat(omdbData.imdbRating) || null,
                    posterShape: tmdbMovie?.backdrop_path ? `${envConfig.baseUrlTmdb}w1280${tmdbMovie.backdrop_path}` : null,
                    background: tmdbMovie?.backdrop_path ? `${envConfig.baseUrlTmdb}w1280${tmdbMovie.backdrop_path}` : null,
                    description: tmdbMovie?.overview || omdbData.Plot,
                    genre: omdbData.Genre.split(',').map((genre) => genre.trim()),
                    runtime: omdbData.Runtime,
                    director: omdbData.Director.split(',').map((director) => director.trim()),
                    cast: omdbData.Actors.split(',').map((actor) => actor.trim()),
                };

                metas.push(meta);
                console.log(`[Catalog] Added movie: ${omdbData.Title} (${imdbId})`);

            } catch (movieError) {
                console.error(`[Catalog] Error processing movie ${imdbId}:`, movieError.message);
                // Continue with next movie
            }
        }

        res.json({ metas });
        console.log(`[Catalog] Successfully served ${metas.length} movies`);

    } catch (error) {
        console.error(`[Catalog] ERROR fetching IMDb watchlist:`, error.message);
        res.json({ metas: [] });
    }
});

// Serve configure page
app.get('/configure', (req, res) => {
    res.sendFile(path.join(__dirname, 'static', 'configure.html'));
});

// Start server
const PORT = envConfig.port;

console.log('='.repeat(60));
console.log(`🎬 Stremio IMDb Watchlist Addon`);
console.log('='.repeat(60));
console.log(`📍 Version: ${baseManifest.version}`);
console.log(`👤 Default IMDb User ID: ${envConfig.defaultImdbUserId}`);
console.log(`🎯 Max items: ${envConfig.maxItems}`);
console.log(`⚡ Port: ${PORT}`);
console.log(`🌐 TMDB Language: ${envConfig.tmdbLanguage}`);
console.log('='.repeat(60));
console.log(`Server running at: http://localhost:${PORT}/manifest.json`);
console.log(`Configuration page: http://localhost:${PORT}/configure`);
console.log('='.repeat(60));

app.listen(PORT);

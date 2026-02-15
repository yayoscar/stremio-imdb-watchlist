require('dotenv').config();
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');
const cheerio = require('cheerio');
const express = require('express');
const path = require('path');

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
if (!config.omdbApiKey) {
    console.error('ERROR: OMDB_API_KEY is required. Set it in .env file.');
    process.exit(1);
}

if (!config.tmdbApiKey) {
    console.error('ERROR: TMDB_API_KEY is required. Set it in .env file.');
    process.exit(1);
}

// Load manifest.json for consistency
const fs = require('fs');
const manifestPath = __dirname + '/manifest.json';
let baseManifest;

try {
    baseManifest = JSON.parse(fs.readFileSync(manifestPath));
} catch (error) {
    console.error('ERROR: Could not read manifest.json:', error.message);
    process.exit(1);
}

// Helper to parse IMDb User ID from URL
// Stremio calls addon with: http://domain.com/:userData/manifest.json
function parseUserDataFromPath(path) {
    const parts = path.parse(path).dir.split(path.sep);
    // The user data should be a single path component before manifest.json
    for (let i = 0; i < parts.length; i++) {
        if (parts[i] === 'manifest.json') {
            return parts[i - 1] || '';
        }
    }
    return '';
}



// Create manifest builder with user-specific IMDb user ID
// We'll intercept the URL to extract user data
const app = express();

// Serve static files (including configure page)
app.use(express.static(__dirname + '/static'));

// Serve manifest.json dynamically based on user data
app.get('/:userParam/manifest.json', (req, res) => {
    const userProfileId = req.params.userParam;
    
    // Clone the base manifest and update name with user ID
    const userManifest = {
        ...baseManifest,
        name: `IMDb Watchlist (${userProfileId})`,
        description: `Watchlist for IMDb user: ${userProfileId}`
    };
    
    res.json(userManifest);
});

// Serve default manifest (no user data)
app.get('/manifest.json', (req, res) => {
    res.json(baseManifest);
});

// Define catalog handler with user-specific IMDb ID
const builder = new addonBuilder(baseManifest);

builder.defineCatalogHandler(async (args) => {
    const startTime = Date.now();
    
    // Extract IMDb user ID from the URL's first path component
    // Stremio requests: http://domain.com/:userId/catalog/type/id.json
    const userProfileId = args.type;

        const IMDB_WATCHLIST_URL = `https://m.imdb.com/user/${config.imdbUserId}/watchlist`;
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
            // Limitar a maxItems
            if (metas.length >= config.maxItems) break;

            // Extract IMDb ID from link
            const linkElement = $(element).find('a.ipc-lockup-overlay');
            const imdbId = linkElement.attr('href')?.match(/\/title\/(tt\d+)\//)?.[1];

            if (!imdbId) {
                console.warn(`[Catalog] Could not extract IMDb ID from element`);
                continue;
            }

            try {
                // Fetch data from OMDB
                const omdbUrl = `https://www.omdbapi.com/?i=${imdbId}&apikey=${config.omdbApiKey}&plot=full`;
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
                        `https://api.themoviedb.org/3/find/${imdbId}?external_source=imdb_id&language=${config.tmdbLanguage}`,
                        {
                            headers: {
                                'Authorization': `Bearer ${config.tmdbApiKey}`,
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
                    posterShape: tmdbMovie?.backdrop_path ? `${config.baseUrlTmdb}w1280${tmdbMovie.backdrop_path}` : null,
                    background: tmdbMovie?.backdrop_path ? `${config.baseUrlTmdb}w1280${tmdbMovie.backdrop_path}` : null,
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

        const elapsed = Date.now() - startTime;
        console.log(`[Catalog] Successfully fetched ${metas.length} movies in ${elapsed}ms`);

        return { metas };
    } catch (error) {
        const elapsed = Date.now() - startTime;
        console.error(`[Catalog] ERROR fetching IMDb watchlist after ${elapsed}ms:`, error.message);
        return { metas: [] };
    }
});

// Servir el complemento
const interface = builder.getInterface();
serveHTTP(interface, { port: config.port });

console.log('='.repeat(60));
console.log(`🎬 Stremio IMDb Watchlist Addon`);
console.log('='.repeat(60));
console.log(`📍 Version: ${manifest.version}`);
console.log(`👤 IMDb User ID: ${config.imdbUserId}`);
console.log(`🎯 Max items: ${config.maxItems}`);
console.log(`⚡ Port: ${config.port}`);
console.log(`🌐 TMDB Language: ${config.tmdbLanguage}`);
console.log('='.repeat(60));
console.log(`Server running at: http://localhost:${config.port}/manifest.json`);
console.log('='.repeat(60));


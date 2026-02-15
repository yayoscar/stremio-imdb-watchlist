require('dotenv').config();
const axios = require('axios');
const cheerio = require('cheerio');
const express = require('express');
const cors = require('cors');
const fs = require('fs');

const envConfig = {
    maxItems: parseInt(process.env.MAX_ITEMS) || 8,
    port: parseInt(process.env.PORT) || 7000,
    host: process.env.HOST || `http://localhost:${parseInt(process.env.PORT) || 7000}`,
    omdbApiKey: process.env.OMDB_API_KEY,
    tmdbApiKey: process.env.TMDB_API_KEY,
    tmdbLanguage: process.env.TMDB_LANGUAGE || 'es',
    baseUrlTmdb: 'https://image.tmdb.org/t/p/',
    defaultImdbUserId: process.env.IMDB_USER_ID || 'ur27472448',
    nodeEnv: process.env.NODE_ENV || 'development'
};

if (!envConfig.omdbApiKey) {
    console.error('ERROR: OMDB_API_KEY es requerido');
    process.exit(1);
}

if (!envConfig.tmdbApiKey) {
    console.error('ERROR: TMDB_API_KEY es requerido');
    process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.static(__dirname + '/static'));

// Function to fetch IMDb watchlist
async function getIMDbWatchlist(userId) {
    const url = `https://m.imdb.com/user/${userId}/watchlist`;
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5'
            }
        });
        if (response.status === 200) {
            return response.data;
        }
    } catch (error) {
        if (error.response?.status === 404) {
            console.error(`Error 404: Usuario '${userId}' no encontrado`);
        } else {
            console.error('Error al obtener lista:', error.message);
        }
    }
    return null;
}

// Function to get TMDb ID
async function getTMDbId(imdbId) {
    const url = `https://api.themoviedb.org/3/find/${imdbId}?api_key=${envConfig.tmdbApiKey}&external_source=imdb_id&language=${envConfig.tmdbLanguage}`;
    try {
        const response = await axios.get(url);
        if (response.status === 200 && response.data) {
            return response.data.movie_results?.[0] || response.data.tv_results?.[0];
        }
    } catch (error) {
        console.error('Error TMDB:', error.message);
    }
    return null;
}

// Main catalog handler with Stremio extras parameter support
async function handleCatalogRequest(req, res) {
    let userId = envConfig.defaultImdbUserId;
    const maxItems = parseInt(req.query.maxItems) || envConfig.maxItems;

    console.log(`[Catalog] Request received:`, {
        path: req.path,
        query: req.query,
        userId: userId
    });

    // Extract userId from URL parameter 'extra' (Stremio extras format)
    // Stremio sends extras as: ?extra=userId:urXXXXXXX
    if (req.query.extra && req.query.extra.startsWith('userId:')) {
        userId = req.query.extra.split(':')[1];
        console.log(`[Catalog] ✓ User ID from extra parameter: ${userId}`);
    }
    // Extract userId from URL path parameter (alternative format, for backwards compatibility)
    else if (req.params.userId && req.params.userId !== 'manifest') {
        userId = req.params.userId;
        console.log(`[Catalog] ✓ User ID from path parameter: ${userId}`);
    }

    // Validate userId format
    if (!userId.match(/^ur\d+$/i)) {
        console.warn(`[Catalog] ✗ Invalid user ID format received: ${userId}`);
        return res.json({
            metas: [],
            error: `Invalid user ID format. Expected: urXXXXXXX. Received: ${userId}`
        });
    }

    console.log(`[Catalog] ✓ Processing for user: ${userId}, items: ${maxItems}`);

    try {
        const watchlistHtml = await getIMDbWatchlist(userId);

        if (!watchlistHtml) {
            console.log(`[Catalog] ✗ No data retrieved for user: ${userId}`);
            return res.json({ metas: [] });
        }

        const $ = cheerio.load(watchlistHtml);
        const movieItems = [];
        const $items = $('li.ipc-metadata-list-summary-item');

        $items.each((index, element) => {
            const titleRaw = $(element).find('.ipc-title__text').text().trim();
            const title = titleRaw.replace(/^\d+\.\s*/, '');
            const $link = $(element).find('a[href*="/title/tt"]').first();
            const href = $link.attr('href') || '';
            const imdbIdMatch = href.match(/title\/(tt\d+)/);
            const imdbId = imdbIdMatch ? imdbIdMatch[1] : null;
            const yearText = $(element).find('.dli-title-metadata-item').first().text().trim() || '';
            const yearMatch = yearText.match(/(\d{4})/);
            const year = yearMatch ? parseInt(yearMatch[1]) : null;

            if (title && imdbId) {
                movieItems.push({ title, imdbId, year });
            }
        });

        console.log(`[Catalog] ✓ Extracted ${movieItems.length} items from watchlist`);

        if (movieItems.length === 0) {
            console.log(`[Catalog] ⚠ No items available to display`);
            return res.json({ metas: [] });
        }

        const metas = [];
        for (const item of movieItems) {
            if (metas.length >= maxItems) break;

            const tmdbInfo = await getTMDbId(item.imdbId);

            if (tmdbInfo) {
                const poster = tmdbInfo.poster_path
                    ? `${envConfig.baseUrlTmdb}w500${tmdbInfo.poster_path}`
                    : `https://stremio-v4-cache1.fcdn.io/images/poster_small.jpg`;
                const backdrop = tmdbInfo.backdrop_path
                    ? `${envConfig.baseUrlTmdb}w780${tmdbInfo.backdrop_path}`
                    : null;

                const omdbResponse = await axios.get(`http://www.omdbapi.com/?i=${item.imdbId}&apikey=${envConfig.omdbApiKey}`);
                const omdbData = omdbResponse.data;

                metas.push({
                    id: `imdb:${item.imdbId}`,
                    type: 'movie',
                    name: item.title,
                    year: item.year,
                    poster,
                    background: backdrop,
                    genres: tmdbInfo.genre_names || [],
                    description: omdbData?.Plot || '',
                });
                console.log(`[Catalog] ✓ Added: ${item.title} (${item.imdbId})`);
            }
        }

        console.log(`[Catalog] ✓ Returning ${metas.length} movies to Stremio`);
        res.json({ metas });

    } catch (error) {
        console.error(`[Catalog] ✗ Error processing watchlist:`, error.message);
        res.json({ metas: [] });
    }
}

// Manifest endpoint - Generic (without userId)
app.get('/manifest.json', (req, res) => {
    console.log('[Manifest] Serving generic manifest');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json({
        id: 'org.stremio.imdbwatchlist',
        version: '1.1.1',
        name: 'IMDb Watchlist',
        description: 'Add-on to browse IMDb user watchlist with enhanced metadata from TMDB',
        resources: ['catalog'],
        types: ['movie'],
        catalogs: [
            {
                id: 'imdbwatchlist',
                name: 'IMDb Watchlist',
                type: 'movie'
            }
        ],
        behaviorHints: {
            configurable: true
        },
        extras: [
            {
                name: 'userId',
                isRequired: false,
                title: 'IMDb User ID',
                description: 'Tu ID de usuario de IMDb (formato: urXXXXXXX)'
            }
        ]
    });
});

// Manifest endpoint - With userId preloaded
app.get('/:userId/manifest.json', (req, res) => {
    const userId = req.params.userId;
    
    // Validate userId format
    if (!userId.match(/^ur\d+$/i)) {
        console.warn(`[Manifest] Invalid user ID format: ${userId}`);
        return res.status(400).json({ error: 'Invalid user ID format. Expected: urXXXXXXX' });
    }
    
    console.log(`[Manifest] Serving manifest for user: ${userId}`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json({
        id: `org.stremio.imdbwatchlist.${userId}`,
        version: '1.1.1',
        name: `IMDb Watchlist (${userId})`,
        description: `Tu lista de seguimiento de IMDb - Usuario: ${userId}`,
        resources: ['catalog'],
        types: ['movie'],
        catalogs: [
            {
                id: 'imdbwatchlist',
                name: `IMDb Watchlist - ${userId}`,
                type: 'movie',
                extra: [
                    {
                        name: 'userId',
                        isRequired: false,
                        options: [userId],
                        optionsLimit: 1
                    }
                ]
            }
        ],
        behaviorHints: {
            configurable: false
        }
    });
});

// Catalog endpoint - STREMIO EXTRA FORMAT
app.get('/catalog/movie/imdbwatchlist.json', handleCatalogRequest);

// Configure page
app.get('/configure', (req, res) => {
    res.sendFile(__dirname + '/static/configure.html');
});

// Start server
const manifest = app.getBaseManifest ? app.getBaseManifest() : null;
const version = manifest ? manifest.version : '1.1.0';

console.log('='.repeat(60));
console.log(`🎬 Stremio IMDb Watchlist Addon v${version}`);
console.log('='.repeat(60));
console.log(`📡 Server endpoint: ${envConfig.host}/manifest.json`);
console.log(`⚙️ Configuration: ${envConfig.host}/configure`);
console.log(`📦 Catalog: ${envConfig.host}/catalog/movie/imdbwatchlist/manifest.json`);
console.log(`🌍 Environment: ${envConfig.nodeEnv}`);
console.log('='.repeat(60));
console.log('');
console.log('📋 COMO USAR:');
console.log(`1. Instala el addon desde: ${envConfig.host}/manifest.json`);
console.log('2. Abre el menú Addons en Stremio');
console.log('3. Haz clic en IMDb Watchlist');
console.log('4. Haz clic en el icono de engranaje (configurar)');
console.log('5. Ingresa tu ID de usuario de IMDb y guarda los cambios');
console.log('='.repeat(60));
console.log('');

app.listen(envConfig.port);

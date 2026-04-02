require('dotenv').config();
const axios = require('axios');

const express = require('express');
const cors = require('cors');

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

const app = express();
app.use(cors());

const SERIES_TYPES = ['tvSeries', 'tvMiniSeries'];
const MOVIE_TYPES = ['movie', 'short', 'tvMovie', 'tvSpecial', 'video', 'documentary'];

function getStremioType(imdbType) {
    if (SERIES_TYPES.includes(imdbType)) return 'series';
    return 'movie';
}

async function getIMDbUserName(userId) {
    try {
        const query = `{ predefinedList(classType: WATCH_LIST, userId: "${userId}") { author { nickName } } }`;
        const response = await axios.post('https://caching.graphql.imdb.com/', { query }, {
            headers: {
                'content-type': 'application/json',
                'x-imdb-client-name': 'imdb-web-next'
            },
            timeout: 10000
        });
        return response.data?.data?.predefinedList?.author?.nickName || null;
    } catch (error) {
        return null;
    }
}

async function getIMDbWatchlist(userId) {
    const GRAPHQL_URL = 'https://caching.graphql.imdb.com/';
    const PAGE_SIZE = 250;

    const query = `{
        predefinedList(classType: WATCH_LIST, userId: "${userId}") {
            items(first: ${PAGE_SIZE}) {
                edges {
                    node {
                        item {
                            ... on Title {
                                id
                                titleText { text }
                                releaseYear { year }
                                titleType { id }
                                ratingsSummary { aggregateRating }
                                primaryImage { url }
                                titleGenres { genres { genre { text } } }
                                runtime { seconds displayableProperty { value { plainText } } }
                            }
                        }
                    }
                }
            }
        }
    }`;

    try {
        const response = await axios.post(GRAPHQL_URL, { query }, {
            headers: {
                'content-type': 'application/json',
                'x-imdb-client-name': 'imdb-web-next'
            },
            timeout: 15000
        });

        if (response.status === 200 && response.data?.data) {
            const edges = response.data.data.predefinedList?.items?.edges;

            if (edges && edges.length > 0) {
                const items = edges.map(edge => {
                    const item = edge.node?.item;
                    if (!item) return null;
                    const imdbType = item.titleType?.id || 'movie';
                    return {
                        imdbId: item.id,
                        title: item.titleText?.text || '',
                        year: item.releaseYear?.year || null,
                        poster: item.primaryImage?.url || null,
                        rating: item.ratingsSummary?.aggregateRating || null,
                        genres: item.titleGenres?.genres?.map(g => g.genre?.text).filter(Boolean) || [],
                        runtime: item.runtime?.displayableProperty?.value?.plainText || null,
                        imdbType: imdbType,
                        stremioType: getStremioType(imdbType)
                    };
                }).filter(i => i && i.imdbId && i.title);

                return { items, source: 'json' };
            }
        }
    } catch (error) {
        console.error(`Error fetching watchlist via GraphQL:`, error.message);
    }
    return null;
}

async function getTMDbInfo(imdbId, stremioType) {
    const url = `https://api.themoviedb.org/3/find/${imdbId}?external_source=imdb_id&language=${envConfig.tmdbLanguage}`;
    try {
        const response = await axios.get(url, {
            headers: {
                'Authorization': `Bearer ${envConfig.tmdbApiKey}`,
                'accept': 'application/json'
            }
        });
        if (response.status === 200 && response.data) {
            if (stremioType === 'series') {
                return response.data.tv_results?.[0] || null;
            }
            return response.data.movie_results?.[0] || null;
        }
    } catch (error) {
        console.error('Error TMDB:', error.message);
    }
    return null;
}

async function handleCatalogRequest(req, res) {
    let userId = envConfig.defaultImdbUserId;
    const maxItems = parseInt(req.query.maxItems) || envConfig.maxItems;
    const requestedType = req.params.type || 'movie';

    if (req.query.extra && req.query.extra.startsWith('userId:')) {
        userId = req.query.extra.split(':')[1];
    } else if (req.params.userId && req.params.userId !== 'manifest') {
        userId = req.params.userId;
    }

    if (!userId.match(/^ur\d+$/i)) {
        return res.json({
            metas: [],
            error: `Invalid user ID format. Expected: urXXXXXXX. Received: ${userId}`
        });
    }

    try {
        const watchlistData = await getIMDbWatchlist(userId);

        if (!watchlistData) {
            return res.json({ metas: [] });
        }

        let allItems = [];

        if (watchlistData.source === 'json' && watchlistData.items) {
            allItems = watchlistData.items.filter(item => item.stremioType === requestedType);
        }

        if (allItems.length === 0) {
            return res.json({ metas: [] });
        }

        const metas = [];
        for (const item of allItems) {
            if (metas.length >= maxItems) break;

            const tmdbInfo = item.poster ? item : await getTMDbInfo(item.imdbId, item.stremioType);

            if (tmdbInfo) {
                const poster = tmdbInfo.poster_path
                    ? `${envConfig.baseUrlTmdb}w500${tmdbInfo.poster_path}`
                    : tmdbInfo.poster || `https://stremio-v4-cache1.fcdn.io/images/poster_small.jpg`;
                const backdrop = tmdbInfo.backdrop_path
                    ? `${envConfig.baseUrlTmdb}w780${tmdbInfo.backdrop_path}`
                    : null;

                let description = '';
                try {
                    const omdbResponse = await axios.get(`http://www.omdbapi.com/?i=${item.imdbId}&apikey=${envConfig.omdbApiKey}`);
                    description = omdbResponse.data?.Plot || '';
                } catch (e) {}

                metas.push({
                    id: item.imdbId,
                    type: item.stremioType,
                    name: item.title,
                    releaseInfo: item.year ? String(item.year) : undefined,
                    runtime: item.runtime || undefined,
                    poster,
                    background: backdrop,
                    genres: tmdbInfo.genres || [],
                    description,
                    imdbRating: item.rating || tmdbInfo.vote_average
                });
            }
        }

        res.json({ metas });

    } catch (error) {
        console.error(`Error processing watchlist:`, error.message);
        res.json({ metas: [] });
    }
}

app.get('/manifest.json', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json({
        id: 'org.stremio.imdbwatchlist',
        version: '1.2.0',
        name: 'IMDb Watchlist',
        description: 'Add-on to browse IMDb user watchlist with enhanced metadata from TMDB',
        resources: ['catalog', 'meta'],
        types: ['movie', 'series'],
        catalogs: [
            {
                id: 'imdbwatchlist_movies',
                name: 'IMDb Watchlist - Movies',
                type: 'movie'
            },
            {
                id: 'imdbwatchlist_series',
                name: 'IMDb Watchlist - Series',
                type: 'series'
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

app.get('/:userId/manifest.json', async (req, res) => {
    const userId = req.params.userId;

    if (!userId.match(/^ur\d+$/i)) {
        return res.status(400).json({ error: 'Invalid user ID format. Expected: urXXXXXXX' });
    }

    const displayName = await getIMDbUserName(userId) || userId;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json({
        id: `org.stremio.imdbwatchlist.${userId}`,
        version: '1.2.0',
        name: `IMDb Watchlist (${displayName})`,
        description: `Lista de seguimiento de IMDb - ${displayName}`,
        resources: ['catalog', 'meta'],
        types: ['movie', 'series'],
        catalogs: [
            {
                id: 'imdbwatchlist_movies',
                name: `IMDb Movies - ${displayName}`,
                type: 'movie',
                extra: [{ name: 'userId', isRequired: false, options: [userId], optionsLimit: 1 }]
            },
            {
                id: 'imdbwatchlist_series',
                name: `IMDb Series - ${displayName}`,
                type: 'series',
                extra: [{ name: 'userId', isRequired: false, options: [userId], optionsLimit: 1 }]
            }
        ],
        behaviorHints: {
            configurable: false
        }
    });
});

async function handleMetaRequest(req, res) {
    const type = req.params.type;
    const imdbId = req.params.id?.replace('.json', '');

    if (!imdbId || !imdbId.startsWith('tt')) {
        return res.json({ meta: null });
    }

    try {
        const query = `{
            title(id: "${imdbId}") {
                id
                titleText { text }
                originalTitleText { text }
                releaseYear { year endYear }
                titleType { id }
                ratingsSummary { aggregateRating }
                primaryImage { url }
                titleGenres { genres { genre { text } } }
                runtime { seconds displayableProperty { value { plainText } } }
                plot { plotText { plainText } }
            }
        }`;

        const graphqlResponse = await axios.post('https://caching.graphql.imdb.com/', { query }, {
            headers: {
                'content-type': 'application/json',
                'x-imdb-client-name': 'imdb-web-next'
            },
            timeout: 15000
        });

        const title = graphqlResponse.data?.data?.title;
        if (!title) {
            return res.json({ meta: null });
        }

        const imdbType = title.titleType?.id || 'movie';
        const stremioType = getStremioType(imdbType);
        const year = title.releaseYear?.year;
        const endYear = title.releaseYear?.endYear;
        const isSeries = SERIES_TYPES.includes(imdbType);

        let releaseInfo;
        if (isSeries && year) {
            releaseInfo = endYear ? `${year}-${endYear}` : `${year}-`;
        } else if (year) {
            releaseInfo = String(year);
        }

        const tmdbInfo = await getTMDbInfo(imdbId, stremioType);

        const poster = tmdbInfo?.poster_path
            ? `${envConfig.baseUrlTmdb}w500${tmdbInfo.poster_path}`
            : title.primaryImage?.url || null;
        const background = tmdbInfo?.backdrop_path
            ? `${envConfig.baseUrlTmdb}w780${tmdbInfo.backdrop_path}`
            : null;

        let description = title.plot?.plotText?.plainText || '';
        if (!description && envConfig.omdbApiKey) {
            try {
                const omdbResponse = await axios.get(`http://www.omdbapi.com/?i=${imdbId}&apikey=${envConfig.omdbApiKey}`);
                description = omdbResponse.data?.Plot || '';
            } catch (e) {}
        }

        const meta = {
            id: imdbId,
            type: stremioType,
            name: title.titleText?.text || '',
            releaseInfo,
            runtime: title.runtime?.displayableProperty?.value?.plainText || undefined,
            poster,
            background,
            logo: undefined,
            genres: title.titleGenres?.genres?.map(g => g.genre?.text).filter(Boolean) || [],
            description,
            imdbRating: title.ratingsSummary?.aggregateRating ? String(title.ratingsSummary.aggregateRating) : undefined
        };

        res.json({ meta });

    } catch (error) {
        console.error(`Error fetching meta for ${imdbId}:`, error.message);
        res.json({ meta: null });
    }
}

app.get('/catalog/:type/:id.json', handleCatalogRequest);
app.get('/:userId/catalog/:type/:id.json', handleCatalogRequest);

app.get('/meta/:type/:id.json', handleMetaRequest);
app.get('/:userId/meta/:type/:id.json', handleMetaRequest);

app.get('/configure', (req, res) => {
    const host = req.get('host') || 'localhost:7000';
    const protocol = req.protocol || 'https';
    const baseUrl = `${protocol}://${host}`;
    
    const html = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>IMDb Watchlist - Configure</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .container { background: rgba(255, 255, 255, 0.05); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 20px; padding: 40px; max-width: 500px; width: 100%; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5); }
        .header { text-align: center; margin-bottom: 30px; }
        .icon { font-size: 48px; margin-bottom: 15px; }
        h1 { color: #ffffff; font-size: 28px; font-weight: 600; margin-bottom: 10px; }
        p.subtitle { color: #a0a0a0; font-size: 14px; line-height: 1.6; }
        .form-group { margin-bottom: 25px; }
        label { display: block; color: #ffffff; font-size: 14px; font-weight: 500; margin-bottom: 8px; }
        input[type="text"] { width: 100%; padding: 14px 16px; background: rgba(255, 255, 255, 0.1); border: 2px solid rgba(255, 255, 255, 0.2); border-radius: 10px; color: #ffffff; font-size: 16px; transition: all 0.3s ease; }
        input[type="text"]:focus { outline: none; border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.3); }
        input[type="text"]::placeholder { color: #666; }
        .help-text { color: #a0a0a0; font-size: 12px; margin-top: 8px; }
        .btn { width: 100%; padding: 16px; border: none; border-radius: 10px; font-size: 16px; font-weight: 600; cursor: pointer; background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); color: #ffffff; }
        .btn:hover { transform: translateY(-2px); }
        .info-box { background: rgba(99, 102, 241, 0.1); border-left: 4px solid #6366f1; padding: 15px; border-radius: 8px; margin-top: 20px; }
        .info-box h3 { color: #6366f1; font-size: 14px; margin-bottom: 8px; }
        .info-box ul { list-style: none; padding: 0; }
        .info-box li { color: #d4d4d4; font-size: 13px; padding: 5px 0 5px 20px; position: relative; }
        .info-box li::before { content: "→"; position: absolute; left: 0; color: #6366f1; }
        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
        .error { color: #ef4444; background: rgba(239, 68, 68, 0.1); border: 1px solid #ef4444; padding: 10px; border-radius: 6px; font-size: 14px; margin-top: 10px; display: none; }
        .error.show { display: block; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="icon">🎬</div>
            <h1>IMDb Watchlist</h1>
            <p class="subtitle">Configura tu usuario de IMDb para ver peliculas y series en Stremio</p>
        </div>
        <form id="configForm">
            <div class="form-group">
                <label for="imdbUserId">Usuario de IMDb</label>
                <input type="text" id="imdbUserId" name="imdbUserId" placeholder="Ejemplo: ur27472448" required autocomplete="off">
                <div class="help-text">Tu ID de usuario de IMDb (formato: urXXXXXXX)</div>
            </div>
            <div class="error" id="errorMessage"></div>
            <div class="info-box">
                <h3>💡 Instrucciones</h3>
                <ul>
                    <li>Ingresa tu ID de usuario de IMDb</li>
                    <li>Haz clic en "Instalar Addon"</li>
                    <li>Veras peliculas y series en catalogos separados</li>
                </ul>
            </div>
            <button type="submit" class="btn" style="margin-top: 20px;">🚀 Instalar Addon</button>
        </form>
        <div class="footer">Powered by Stremio Addon SDK</div>
    </div>
    <script>
        const form = document.getElementById('configForm');
        const input = document.getElementById('imdbUserId');
        const error = document.getElementById('errorMessage');
        const baseUrl = '${baseUrl}';
        
        function validateUserId(userId) { return /^ur\\d+$/i.test(userId); }
        function showError(msg) { error.textContent = '⚠️ ' + msg; error.classList.add('show'); setTimeout(() => error.classList.remove('show'), 5000); }
        
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            const userId = input.value.trim();
            if (userId && !validateUserId(userId)) { showError('ID debe ser: urXXXXXXX'); return; }
            const manifestUrl = userId ? baseUrl + '/' + userId + '/manifest.json' : baseUrl + '/manifest.json';
            window.location.href = 'stremio://' + manifestUrl.replace('https://', '').replace('http://', '');
        });
    </script>
</body>
</html>`;
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
});

module.exports = app;

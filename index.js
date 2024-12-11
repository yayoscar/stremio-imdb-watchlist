const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');
const fs = require('fs');
const cheerio = require('cheerio');
const MovieDB = require('moviedb')('8f5ceb90f4741c6aba3d326d433aff4b');
const MaxItems = 8;
const baseUrlTmdb = "https://image.tmdb.org/t/p/";

// Definir el manifiesto del complemento
const manifest = {
    id: 'org.stremio.imdbtop250',
    version: '0.1.0',
    name: 'Yayoscar Watchlist',
    description: 'Complemento que muestra el watchlist de yayoscar',
    resources: ['catalog'],
    types: ['movie'],
    catalogs: [
        {
            type: 'movie',
            id: 'yayoscar_watchlist',
            name: 'Yayoscar Watchlist',

        }
    ]
};

// Crear el builder del complemento
const builder = new addonBuilder(manifest);



// Definir el manejador del catálogo
builder.defineCatalogHandler(async (args) => {
    try {
        
        
        // URL que devuelve los datos del Top 250 de IMDb (reemplazar con API válida)

        const userCode = 'ur27472448';

        if (!userCode) {
            throw new Error('El parámetro "userCode" es obligatorio.');
        }

        const IMDB_TOP250_URL = `https://m.imdb.com/user/${userCode}/watchlist`;
        const response = await axios.get(IMDB_TOP250_URL,
            {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Referer': 'https://www.google.com/'
                }
            });
        const html = response.data;
        const $ = cheerio.load(html);

        // Array para almacenar los datos extraídos
        const metas = [];
        const elements = $('li.ipc-metadata-list-summary-item').toArray();

        let count = 0;

        // Seleccionar cada elemento de la lista
        for (const element of elements) {

            if (metas.length >= MaxItems) break; // Limitar a 20 resultados

            // Extraer ID de IMDb desde el enlace
            const linkElement = $(element).find('a.ipc-lockup-overlay');
            const imdbId = linkElement.attr('href')?.match(/\/title\/(tt\d+)\//)?.[1];

            
            
            // Validar datos y añadir al array
            if (imdbId) {
                
                const omdbUrl = `https://www.omdbapi.com/?i=${imdbId}&apikey=5c31e48c&plot=full`;
                const omdbResponse = await axios.get(omdbUrl);
                const omdbData = omdbResponse.data;
                if (omdbData.Type === 'movie') {
                    let translatedPlot = omdbData.Plot; // Por defecto, el plot original
                    try {
                        const translateUrl = `https://api-free.deepl.com/v2/translate`;
                        const translationResponse = await axios.post(
                            translateUrl,
                            {
                                text: [omdbData.Plot],
                                target_lang: 'ES', // Cambiar a otro idioma si es necesario
                            },
                            {
                                headers: {
                                    'Authorization': `DeepL-Auth-Key b3c83d75-5f14-478f-ad27-e9a27606acdd:fx`, // Reemplazar con tu API Key
                                },
                            }
                        );
                        translatedPlot = translationResponse.data.translations[0].text;

                        const tmdbResponse = await axios.get(
                            `https://api.themoviedb.org/3/find/${imdbId}?external_source=imdb_id`,
                            {
                                headers: {
                                    'Authorization': `Bearer eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI4ZjVjZWI5MGY0NzQxYzZhYmEzZDMyNmQ0MzNhZmY0YiIsIm5iZiI6MTczMzUwMTA3Ny4xNTkwMDAyLCJzdWIiOiI2NzUzMjA5NDQ2MjQzOTdmYTgxMTg5ZWMiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.8t0pWEgrRmDGSDY7UMErMBsDPxcRgeQUycWgJ0RTrqQ`, // Reemplazar con tu API Key
                                },
                            }
                        );
                        tmdbMovie=tmdbResponse.data.movie_results[0];
                    } catch (translationError) {
                        console.error(`Error al traducir el Plot:`, translationError);
                    }
                    metas.push({
                        id: imdbId,
                        name: omdbData.Title,
                        type: omdbData.Type,
                        year: omdbData.Year,
                        poster: omdbData.Poster,
                        imdbRating: omdbData.imdbRating,
                        posterShape  :`${baseUrlTmdb}w1280${tmdbMovie.backdrop_path}`,
                        background  :`${baseUrlTmdb}w1280${tmdbMovie.backdrop_path}`,
                        description: translatedPlot,
                        genre: omdbData.Genre.split(',').map((genre) => genre.trim()),
                        runtime: omdbData.Runtime,
                        director: omdbData.Director.split(',').map((director) => director.trim()),
                        cast: omdbData.Actors.split(',').map((actor) => actor.trim()),
                    });
                }

            }
        }        // Retornar los datos al catálogo

        return { metas };
    } catch (error) {
        console.error('Error al obtener el Top 250:', error);
        return { metas: [] };
    }
});

// Servir el complemento
const interface = builder.getInterface();
const PORT = process.env.PORT || 7000;
serveHTTP(interface, { port: PORT });

console.log('IMDb Top 250 Stremio Addon está corriendo');

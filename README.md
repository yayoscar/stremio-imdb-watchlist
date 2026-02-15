# Stremio IMDb Watchlist Addon

🎬 **Stremio addon que muestra la lista de seguimiento (watchlist) de un usuario específico de IMDb con metadatos enriquecidos de TMDB.**

![Version](https://img.shields.io/badge/version-1.1.0-blue.svg)
![Node](https://img.shields.io/badge/node->=14.0.0-green.svg)
![License](https://img.shields.io/badge/license-ISC-orange.svg)

## 📋 Características

- ✅ Muestra la watchlist de cualquier usuario de IMDb
- ✅ Metadatos enriquecidos de OMDB y TMDB
- ✅ Descripciones y contenido en múltiples idiomas
- ✅ Posters e imágenes de alta calidad
- ✅ Configuración flexible mediante variables de entorno
- ✅ Manejo robusto de errores y logging detallado
- ✅ API keys protegidas mediante variables de entorno

## 🚀 instalación

### Requisitos previos

- Node.js >= 14.0.0
- Cuenta en IMDb (para obtener tu user ID)
- API Key de [OMDB](http://www.omdbapi.com/apikey.aspx)
- API Key de [The Movie Database (TMDB)](https://www.themoviedb.org/settings/api)

### Paso 1: Clonar repositorio

```bash
git clone https://github.com/tu-usuario/stremio-imdb-watchlist.git
cd stremio-imdb-watchlist
```

### Paso 2: Instalar dependencias

```bash
npm install
```

### Paso 3: Configurar variables de entorno

Copia el archivo de ejemplo:

```bash
cp .env.example .env
```

Edita el archivo `.env` con tus configuraciones:

```env
# IMDb User ID (formato: urXXXXXXX)
IMDB_USER_ID=ur27472448

# Número máximo de películas a mostrar
MAX_ITEMS=8

# Puerto del servidor
PORT=7000

# OMDB API Key (obténela de http://www.omdbapi.com/apikey.aspx)
OMDB_API_KEY=tu_omdb_api_key

# TMDB API Key (obténela de https://www.themoviedb.org/settings/api)
TMDB_API_KEY=tu_tmdb_api_key

# Idioma para descripciones (es, en, pt, etc.)
TMDB_LANGUAGE=es
```

### Paso 4: Iniciar el addon

```bash
npm start
```

El addon estará disponible en: `http://localhost:7000/manifest.json`

## 🔧 Configuración

### Obtener tu IMDb User ID

1. Ve a [IMDB.com](https://www.imdb.com) e inicia sesión
2. Navega a tu perfil
3. La URL será algo como: `https://www.imdb.com/user/ur27472448/`
4. Copia el `urXXXXXXX` (ej: `ur27472448`)

### Variables de Entorno

| Variable | Descripción | Valor por defecto |
|----------|-------------|-------------------|
| `IMDB_USER_ID` | ID de usuario de IMDb | `ur27472448` |
| `MAX_ITEMS` | Número máximo de películas | `8` |
| `PORT` | Puerto del servidor | `7000` |
| `OMDB_API_KEY` | API Key de OMDB | *(requerido)* |
| `TMDB_API_KEY` | API Key de TMDB | *(requerido)* |
| `TMDB_LANGUAGE` | Idioma de descripciones | `es` |

## 📱 Instalar en Stremio

### Opción 1: Instalar desde URL

1. Abre Stremio
2. Ve a **Addons** (icono de rompecabezas)
3. Haz clic en el botón **Install** y pegar tu URL:
   ```
   http://localhost:7000/manifest.json
   ```

### Opción 2: Desarrollo local

Las URLs de addons en Stremio se cargarán con HTTPS (excepto `127.0.0.1`). Si estás probando localmente, debe funcionar sin problema.

## 🎭 Estructura del Código

```
.
├── index.js           # Lógica principal del addon
├── manifest.json      # Manifest del addon (metadata)
├── package.json       # Dependencias de Node.js
├── .env.example      # Ejemplo de configuración
└── README.md         # Documentación
```

### Flujo de Datos

```
IMDb Watchlist (scraping)
    ↓
IDs de Películas
    ↓
OMDB API → Título, tipo, poster, rating, género, duración, director, casting
    ↓
TMDB API → Año, backdrop_path, overview (descripción)
    ↓
Stremio Addon → Catálogo enriquecido
```

## 🐛 Troubleshooting

### El addon no muestra películas

- Verifica que tu `IMDB_USER_ID` es correcto
- Asegúrate de que tu watchlist tiene películas públicas
- Revisa el terminal para mensajes de error

### Error: "OMDB_API_KEY is required"

- Asegúrate de haber creado el archivo `.env`
- Verifica que la API key de OMDB es válida

### Error: "TMDB_API_KEY is required"

- Asegúrate de haber configurado la API key de TMDB en `.env`

### Velocidad de carga lenta

- Reduce `MAX_ITEMS` para obtener resultados más rápidos
- Considera usar un servidor más rápido para producción

## 🔒 Seguridad

⚠️ **IMPORTANTE**: Nunca commits tu archivo `.env` con API keys reales. El archivo `.gitignore` ya está configurado para ignorarlo.

## 📝 Pendientes / Roadmap

- [ ] Soporte para Letterboxd (además de IMDb)
- [ ] Caché de resultados para mejorar rendimiento
- [ ] Soporte para TV shows (actualmente solo películas)
- [ ] Filtros por género, año, rating
- [ ] Paginación de resultados
- [ ] Tests unitarios
- [ ] Soporte para múltiples usuarios simultáneos

## 🤝 Contribuir

Las contribuciones son bienvenidas! Por favor:

1. Fork el repositorio
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📄 Licencia

Este proyecto está bajo la Licencia ISC - ver el archivo [LICENSE](LICENSE) para detalles.

## 🙏 Agradecimientos

- [Stremio](https://www.stremio.com/) - Por la plataforma
- [OMDB](http://www.omdbapi.com/) - Por la API de datos de películas
- [TMDB](https://www.themoviedb.org/) - Por las descripciones e imágenes enriquecidas
- [stremio-addon-sdk](https://github.com/Stremio/stremio-addon-sdk) - Por el SDK oficial

## 📄 Recursos

- [Stremio Addon SDK](https://github.com/Stremio/stremio-addon-sdk)
- [Stremio Addon Protocol](https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/protocol.md)
- [IMDB User Help](https://help.imdb.com/)

---

Hecho con ❤️ por la comunidad

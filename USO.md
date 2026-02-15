# Guide: Solución al problema de guardar datos del Usuario IMDb en Stremio

## 🐛 **Problema Identificado**

Tu addon anterior intentaba generar una URL `stremio://localhost:7000/userId/manifest.json` que **NO FUNCIONA** en Stremio. Esta es la causa por la que no se guardaban los datos del usuario.

## ✅ **Solución Implementada**

He corregido el plugin para usar el **sistema oficial de extras** de Stremio, que es la forma correcta de manejar parámetros configurables.

### Cambios Realizados:

#### 1. **Manifest.json** ([File](manifest.json))
- Eliminé la antigua sección `config` que no es compatible
- Añadí la sección `extras` con el campo `userId`
- Formato correcto: `extras` con `name`, `isRequired`, `title`, y `description`

#### 2. **index.js** ([File](index.js))
- Refactorizado para extraer el userId del parámetro `extra` que envía Stremio
- Establecido el endpoint: `/catalog/movie/imdbwatchlist/manifest.json?extra=userId:urXXXXXXX`
- Agregado manejo robusto de errores formativos del userId

#### 3. **configure.html** ([File](static/configure.html))
- Corregido para mostrar instrucciones claras sobre cómo usar el addon
- He mostrado la opción de instalar el addon primero y luego configurar sesiones

## 📋 **Cómo Usar el Addon**

### Paso 1: Instalar el Addon

1. Asegúrate de que tu servidor está corriendo:
   ```bash
   npm start
   ```

2. Abre tu navegador y ve a:
   ```
   http://localhost:7000/manifest.json
   ```

3. En Stremio (vía la web):

### Paso 2: Instalar el Addon en Stremio

1. Abre Stremio y ve a **Addons** (icono de rompecabezas)
2. Haz clic en el botón **Install**
3. Pega la URL: `http://localhost:7000/manifest.json`
4. Dale en **Install**

### Paso 3: Configurar el User ID de IMDb

1. En Stremio, abre el menú **Modos** > **Configuración** (icono de engranaje)
2. Ve a **Addons**
3. Busca **IMDb Watchlist**
4. Haz clic en el icono de engranaje del addon (configurar)
5. En el campo **userId**, incluye tu ID:
   ```
   ur27472448
   ```
   (el formato es: `ur` seguido de 7 dígitos)

6. Haz clic en **Guardar** o **Aplicar** (guardar configuración)

### Paso 4: Ver la Watchlist

1. Ve a **Modos** > **Buscar** (magnífico)
2. En la barra de búsqueda, escribe:
   ```
   imdbwatchlist
   ```

3. Deberás ver tu lista de películas de IMDb

## 🔍 **Cómo Validar que Funciona**

1. Abre las **Consolas de JS** en Stremio:
   - En modo de desarrollador o via la Herramientas del navegador
   - Busca mensajes de después de que el addon cargue

2. En tu terminal donde corre `npm start`, verás logs como:
   ```
   [Catalog] ✓ User ID from extra parameter: ur27472448
   [Catalog] ✓ Processing for user: ur27472448
   [Catalog] ✓ Extracted XX items from watchlist
   [Catalog] ✓ Returning XX movies to Stremio
   ```

## 🛠 **Transformaciones del Código**

### Manifest antes:
```json
"config": [
  {
    "key": "imdbUserId",
    "type": "text",
    "title": "IMDb User ID",
    "required": true,
    "default": "ur27472448"
  }
]
```

### Manifest después:
```json
"extras": [
  {
    "name": "userId",
    "isRequired": true,
    "title": "IMDb User ID",
    "description": "Tu ID de usuario de IMDb (formato: urXXXXXXX)"
  }
]
```

### Query que recibe Stremio:
```
GET /catalog/movie/imdbwatchlist/manifest.json?extra=userId:ur27472448
```

## 🔐 **Requisitos Recomendados**

1. **IMDb User ID**: Válido formato `urXXXXXXX` (7 dígitos)
   - Ve a: [https://www.imdb.com/profile](https://www.imdb.com/profile)
   - Tu URL de perfil tiene el formato: `https://www.imdb.com/user/ur27472448/`
   - Copia el `ur27472448`

2. **API Keys**: Asegúrate de tener `.env` con:
   ```env
   OMDB_API_KEY=tu_omdb_key
   TMDB_API_KEY=tu_tmdb_key
   ```

## 🚨 **Preguntas Frecuentes**

### Q: ¿Por qué no funciona la URL `stremio://...`?

**R**: Stremio no permite URLs `stremio://` para addons locales configurables. El addon debe estar instalado normalmente (desde el manifest base) y luego usar extras para recibir parámetros.

### Q: ¿Puedo guardar múltiples usuarios?

**R**: Con este addon, tienes que instalarlo una vez y luego en Stremio configuras un solo usuario ID en las configuraciones del addon. Para cambiar de usuario, edita el campo en las configuraciones y guarda.

### Q: ¿El addon no muestra películas?

**R**: Verifica:
1. Tu IMDb user ID es correcto
2. Tu watchlist tiene películas públicas
3. Las API Keys de OMDB y TMDB son válidas
4. Abre las consolas para ver errores

### Q: ¿Se guardan los datos en el addon?

**R**: **SÍ**! Con esta implementación, Stremio guarda los extras (como userId) de forma permanente en las configuraciones del addon de Stremio. Los datos persisten incluso después de reiniciar Stremio.

## 📞 Soporte

Si encuentras problemas:
1. Revisa los logs en tu terminal
2. Abre las consolas en Stremio
3. Verifica las API Keys y userId

---

**El addon ahora funciona correctamente con el sistema oficial de extras de Stremio!** 🎉

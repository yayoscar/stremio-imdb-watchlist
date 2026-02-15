# 🚀 Guía de Deployment en Servidor Propio

## Requisitos del Servidor

- **OS:** Ubuntu 20.04+ / Debian 11+
- **RAM:** Mínimo 512MB, recomendado 1GB
- **CPU:** 1-2 cores
- **Disco:** 10GB
- **Puerto:** 80 (HTTP) y 443 (HTTPS) abiertos

## 1. Preparar el Servidor

### Actualizar sistema
```bash
sudo apt update && sudo apt upgrade -y
```

### Instalar Node.js 20 LTS
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version  # Verificar versión
```

### Instalar PM2 (gestor de procesos)
```bash
sudo npm install -g pm2
```

### Instalar Nginx (reverse proxy)
```bash
sudo apt install -y nginx
```

### Instalar Certbot (SSL gratis)
```bash
sudo apt install -y certbot python3-certbot-nginx
```

## 2. Configurar el Proyecto

### Clonar repositorio
```bash
cd /var/www
sudo git clone https://github.com/tu-usuario/stremio-imdb-watchlist.git
cd stremio-imdb-watchlist
sudo chown -R $USER:$USER .
```

### Instalar dependencias
```bash
npm install --production
```

### Configurar variables de entorno
```bash
cp .env.example .env
nano .env
```

Edita el archivo `.env`:
```env
# Tu dominio en producción
HOST=https://tu-dominio.com

# Puerto interno (Nginx hará proxy)
PORT=7000

# Tus API keys
OMDB_API_KEY=tu_key_real
TMDB_API_KEY=tu_key_real

# Usuario por defecto (opcional)
IMDB_USER_ID=ur27472448

# Configuración
MAX_ITEMS=8
TMDB_LANGUAGE=es
```

### Crear directorio de logs
```bash
mkdir -p logs
```

## 3. Configurar PM2

### Iniciar aplicación
```bash
pm2 start ecosystem.config.js
```

### Comandos útiles de PM2
```bash
pm2 status                    # Ver estado
pm2 logs stremio-imdb-watchlist  # Ver logs
pm2 restart stremio-imdb-watchlist  # Reiniciar
pm2 stop stremio-imdb-watchlist     # Detener
pm2 delete stremio-imdb-watchlist   # Eliminar
```

### Configurar PM2 para inicio automático
```bash
pm2 startup systemd
# Ejecuta el comando que te muestre PM2
pm2 save
```

## 4. Configurar Nginx

### Crear archivo de configuración
```bash
sudo nano /etc/nginx/sites-available/stremio-imdb-watchlist
```

Contenido:
```nginx
server {
    listen 80;
    server_name tu-dominio.com www.tu-dominio.com;

    # Logs
    access_log /var/log/nginx/stremio-addon.access.log;
    error_log /var/log/nginx/stremio-addon.error.log;

    # Proxy to Node.js app
    location / {
        proxy_pass http://localhost:7000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Activar configuración
```bash
sudo ln -s /etc/nginx/sites-available/stremio-imdb-watchlist /etc/nginx/sites-enabled/
sudo nginx -t  # Verificar sintaxis
sudo systemctl reload nginx
```

## 5. Configurar SSL (HTTPS)

### Obtener certificado SSL gratis
```bash
sudo certbot --nginx -d tu-dominio.com -d www.tu-dominio.com
```

Certbot configurará automáticamente HTTPS en Nginx.

### Renovación automática
```bash
sudo certbot renew --dry-run  # Probar renovación
```

El certificado se renovará automáticamente cada 90 días.

## 6. Configurar Firewall

```bash
sudo ufw allow 'Nginx Full'
sudo ufw allow OpenSSH
sudo ufw enable
sudo ufw status
```

## 7. Verificar Instalación

### Probar el addon
```
https://tu-dominio.com/manifest.json
```

### Instalar en Stremio
```
https://tu-dominio.com/manifest.json
```

O con usuario específico:
```
https://tu-dominio.com/ur27472448/manifest.json
```

## 8. Actualizar el Addon

```bash
cd /var/www/stremio-imdb-watchlist
git pull origin main
npm install --production
pm2 restart stremio-imdb-watchlist
```

## 9. Monitoreo y Mantenimiento

### Ver logs en tiempo real
```bash
pm2 logs stremio-imdb-watchlist --lines 100
```

### Ver uso de recursos
```bash
pm2 monit
```

### Limpiar logs antiguos
```bash
pm2 flush
```

### Verificar estado del servicio
```bash
pm2 status
sudo systemctl status nginx
```

## 10. Troubleshooting

### El addon no responde
```bash
pm2 restart stremio-imdb-watchlist
sudo systemctl restart nginx
```

### Ver logs de errores
```bash
pm2 logs stremio-imdb-watchlist --err
tail -f /var/log/nginx/stremio-addon.error.log
```

### Verificar conectividad
```bash
curl http://localhost:7000/manifest.json
curl https://tu-dominio.com/manifest.json
```

### Problemas de permisos
```bash
sudo chown -R $USER:$USER /var/www/stremio-imdb-watchlist
```

## 📊 Estimación de Recursos

- **Memoria:** ~50-100MB en reposo
- **CPU:** Bajo (picos al hacer scraping)
- **Ancho de banda:** Depende del tráfico
- **Almacenamiento:** ~50MB (proyecto + logs)

## 🔒 Seguridad

- ✅ Usa HTTPS (SSL/TLS)
- ✅ Mantén las dependencias actualizadas: `npm audit fix`
- ✅ No expongas el archivo `.env`
- ✅ Configura firewall (UFW)
- ✅ Actualiza el sistema regularmente
- ✅ Usa PM2 para reiniciar en caso de crashes

## 💰 Proveedores Recomendados

- **DigitalOcean:** Droplet de $6/mes
- **Hetzner:** VPS de €4.5/mes
- **Linode:** Instance de $5/mes
- **Vultr:** Cloud Compute de $6/mes
- **Contabo:** VPS desde €5/mes

---

¿Necesitas ayuda? Abre un issue en GitHub.

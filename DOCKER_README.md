# Docker Setup for Video Editor

This guide will help you run the video editor application using Docker.

## Prerequisites

- **Docker Desktop** installed and running
- At least 4GB of available RAM
- At least 2GB of free disk space

## Quick Start

### 1. Start the Application

Open a terminal in the project directory and run:

```bash
docker-compose up -d
```

This will:
- Build the backend and frontend Docker images (first time only, takes ~5-10 minutes)
- Start both containers in the background
- Set up networking between services

### 2. Access the Application

Once the containers are running:

- **Frontend**: Open your browser to [http://localhost:5173](http://localhost:5173)
- **Backend API**: Available at [http://localhost:8000](http://localhost:8000)

### 3. Stop the Application

To stop all services:

```bash
docker-compose down
```

## Common Commands

### View Running Containers

```bash
docker-compose ps
```

### View Logs

```bash
# View all logs
docker-compose logs

# View backend logs only
docker-compose logs backend

# View frontend logs only
docker-compose logs frontend

# Follow logs in real-time
docker-compose logs -f
```

### Restart Services

```bash
# Restart all services
docker-compose restart

# Restart backend only
docker-compose restart backend

# Restart frontend only
docker-compose restart frontend
```

### Rebuild Images

If you've modified `Dockerfile` or `requirements.txt`:

```bash
# Rebuild and restart
docker-compose up -d --build

# Rebuild specific service
docker-compose build backend
docker-compose build frontend
```

### Access Container Shell

```bash
# Backend container
docker-compose exec backend bash

# Frontend container
docker-compose exec frontend sh
```

## Development Features

### Hot Reloading

Both backend and frontend support hot-reloading:

- **Backend**: Edit any `.py` file → Uvicorn auto-reloads
- **Frontend**: Edit any file in `src/` → Vite auto-reloads

Changes appear immediately without restarting containers!

### Persistent Data

The following data persists on your host machine:

- **Uploads**: `./backend/public/uploads/`
- **Database**: `./backend/videos.db`

Even if you delete containers, your data remains safe.

## Troubleshooting

### Port Already in Use

**Error**: `Bind for 0.0.0.0:8000 failed: port is already allocated`

**Solution**: Stop any services using ports 8000 or 5173:

```bash
# Windows PowerShell
netstat -ano | findstr :8000
netstat -ano | findstr :5173

# Stop the process using the PID shown
taskkill /PID <PID> /F
```

### Container Won't Start

**Check logs**:
```bash
docker-compose logs backend
docker-compose logs frontend
```

**Common issues**:
- Missing dependencies: Run `docker-compose build --no-cache`
- WSL not updated: Run `wsl --update` and restart Docker Desktop

### FFmpeg Not Found

If you see FFmpeg-related errors:

1. Rebuild the backend image:
   ```bash
   docker-compose build --no-cache backend
   docker-compose up -d
   ```

2. Verify FFmpeg is installed:
   ```bash
   docker-compose exec backend ffmpeg -version
   ```

### Frontend Can't Connect to Backend

**Check**:
1. Both containers are running: `docker-compose ps`
2. Backend is healthy: Open [http://localhost:8000](http://localhost:8000) in browser
3. Network is configured: `docker network inspect video-editor_video-editor-network`

### Changes Not Appearing

**Backend**:
- Check Uvicorn reloaded: Look for "Reloading..." in logs
- Restart manually: `docker-compose restart backend`

**Frontend**:
- Check Vite detected changes: Look in browser console
- Clear browser cache: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
- Restart manually: `docker-compose restart frontend`

## Clean Up

### Remove Containers Only

```bash
docker-compose down
```

### Remove Containers and Images

```bash
docker-compose down --rmi all
```

### Remove Everything (including volumes)

```bash
docker-compose down --rmi all --volumes
```

> ⚠️ **Warning**: This will delete your database and uploads!

## Production Deployment

This Docker setup is optimized for **development**. For production:

1. Use multi-stage builds to reduce image size
2. Set `NODE_ENV=production`
3. Build frontend with `npm run build`
4. Use a production WSGI server (e.g., Gunicorn)
5. Add HTTPS/SSL certificates
6. Configure proper CORS settings

Contact the development team for production deployment guidance.

## Need Help?

- **Docker Desktop Issues**: [Docker Documentation](https://docs.docker.com/desktop/)
- **WSL Issues**: [Microsoft WSL Docs](https://docs.microsoft.com/en-us/windows/wsl/)
- **Application Issues**: Check the main README.md

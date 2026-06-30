# Multi-stage build for frontend + backend
FROM node:18-alpine AS frontend-builder

WORKDIR /app
COPY frontend/ /app/frontend/
# Copy package.json if exists
COPY frontend/package.json /app/frontend/ 2>/dev/null || true
RUN cd frontend && (npm install 2>/dev/null || true)

# Production stage with nginx + python
FROM python:3.10-slim

# Install nginx and python dependencies
RUN apt-get update && apt-get install -y nginx curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy backend
COPY backend/ /app/backend/
COPY backend/requirements.txt /app/backend/
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

# Copy frontend static files
COPY --from=frontend-builder /app/frontend /usr/share/nginx/html

# Create nginx config
RUN echo 'server { \
    listen 7860; \
    location /api/ { \
        proxy_pass http://127.0.0.1:8000/; \
        proxy_set_header Host $host; \
        proxy_set_header X-Real-IP $remote_addr; \
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \
        proxy_set_header X-Forwarded-Proto $scheme; \
    } \
    location / { \
        root /usr/share/nginx/html; \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/sites-available/default

# Expose port
EXPOSE 7860

# Start both services
CMD nginx && uvicorn backend.main:app --host 0.0.0.0 --port 8000

# Multi-stage build for better optimization
FROM node:18-alpine AS frontend-builder

# Build stage for static files
WORKDIR /app
COPY . .
RUN npm install -g serve

# Production stage with nginx
FROM nginx:alpine

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Copy built static files
COPY --from=frontend-builder /app /usr/share/nginx/html

# Create necessary directories
RUN mkdir -p /usr/share/nginx/html/audio_files

# Expose port 80
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]

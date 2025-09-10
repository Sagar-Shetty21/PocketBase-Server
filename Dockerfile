FROM alpine:latest

# Install required packages
RUN apk add --no-cache \
    wget \
    unzip \
    ca-certificates

# Create app directory
WORKDIR /app

# Download and install PocketBase with PostgreSQL support
# Using fondoger's fork which has actual PostgreSQL support
RUN wget https://github.com/fondoger/pocketbase/releases/download/v0.22.21/pocketbase_0.22.21_linux_amd64.zip && \
    unzip pocketbase_0.22.21_linux_amd64.zip && \
    chmod +x pocketbase && \
    rm pocketbase_0.22.21_linux_amd64.zip

# Create data directory
RUN mkdir -p /app/pb_data

# Create non-root user for security
RUN addgroup -g 1001 -S pocketbase && \
    adduser -S pocketbase -u 1001 -G pocketbase

# Set ownership
RUN chown -R pocketbase:pocketbase /app

# Switch to non-root user
USER pocketbase

# Expose port
EXPOSE 8090

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8090/api/health || exit 1

# Start PocketBase with PostgreSQL database if DATABASE_URL is provided
CMD if [ -n "$DATABASE_URL" ]; then \
        ./pocketbase serve --http=0.0.0.0:${PORT:-8090} --dir=/app/pb_data --database="$DATABASE_URL"; \
    else \
        ./pocketbase serve --http=0.0.0.0:${PORT:-8090} --dir=/app/pb_data; \
    fi

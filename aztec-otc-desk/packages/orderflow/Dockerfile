FROM oven/bun:alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/orderflow/package*.json ./packages/orderflow/

# Install dependencies
RUN bun install

# Copy source code
COPY packages/orderflow ./packages/orderflow

# Set working directory to orderflow
WORKDIR /app/packages/orderflow

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Development command with hot reload
CMD ["bun", "run", "dev"]
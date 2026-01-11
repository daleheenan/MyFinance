# FinanceFlow Dockerfile for Railway deployment
# Uses Node.js with native compilation support for better-sqlite3

FROM node:22-alpine AS builder

# Install build dependencies for better-sqlite3 native module and git for versioning
RUN apk add --no-cache python3 make g++ git

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install ALL dependencies (need full npm install for native module compilation)
RUN npm ci

# Copy application code (including .git for versioning)
COPY . .

# Generate version file from git info at build time
RUN if [ -d .git ]; then \
      COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown"); \
      COUNT=$(git rev-list --count HEAD 2>/dev/null || echo "0"); \
      VERSION=$(node -e "console.log(require('./package.json').version)"); \
      echo "{\"version\":\"${VERSION}.${COUNT}+${COMMIT}\"}" > version.json; \
    else \
      VERSION=$(node -e "console.log(require('./package.json').version)"); \
      echo "{\"version\":\"${VERSION}\"}" > version.json; \
    fi

# Production stage - smaller final image
FROM node:22-alpine

WORKDIR /app

# Copy node_modules with compiled native modules
COPY --from=builder /app/node_modules ./node_modules

# Copy application code (exclude dev/test files via .dockerignore)
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/version.json ./
COPY --from=builder /app/server ./server
COPY --from=builder /app/public ./public

# Create data directory for SQLite database with proper permissions
# This directory should be mounted as a Railway Volume for persistence
RUN mkdir -p /app/data && chmod 777 /app/data

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_PATH=/app/data/financeflow.db

# Expose port
EXPOSE 3000

# Health check - give app time to start (better-sqlite3 initialization)
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Start the application
CMD ["node", "server/index.js"]

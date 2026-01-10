# FinanceFlow Dockerfile for Railway deployment
# Uses Node.js with native compilation support for better-sqlite3

FROM node:22-alpine AS builder

# Install build dependencies for better-sqlite3 native module
RUN apk add --no-cache python3 make g++

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install ALL dependencies (need full npm install for native module compilation)
RUN npm ci

# Copy application code
COPY . .

# Production stage - smaller final image
FROM node:22-alpine

WORKDIR /app

# Copy node_modules with compiled native modules
COPY --from=builder /app/node_modules ./node_modules

# Copy application code (exclude dev/test files via .dockerignore)
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/server ./server
COPY --from=builder /app/public ./public

# Create data directory for SQLite database
RUN mkdir -p /app/data

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Start the application
CMD ["node", "server/index.js"]

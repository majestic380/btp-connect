# ══════════════════════════════════════════════════════════════════════════════
# 🏗️ BTP CONNECT v9.3.0 - Backend Dockerfile
# Multi-stage optimized build for production
# ══════════════════════════════════════════════════════════════════════════════

# ══════════════════════════════════════════════════════════════════════════════
# Stage 1: Base image
# ══════════════════════════════════════════════════════════════════════════════
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# ══════════════════════════════════════════════════════════════════════════════
# Stage 2: Dependencies
# ══════════════════════════════════════════════════════════════════════════════
FROM base AS deps

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# ══════════════════════════════════════════════════════════════════════════════
# Stage 3: Builder
# ══════════════════════════════════════════════════════════════════════════════
FROM base AS builder

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/node_modules/.prisma ./node_modules/.prisma

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Clean node_modules and reinstall production only
RUN rm -rf node_modules && \
    npm ci --only=production && \
    npx prisma generate

# ══════════════════════════════════════════════════════════════════════════════
# Stage 4: Runner (Production)
# ══════════════════════════════════════════════════════════════════════════════
FROM base AS runner

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 fastify

# Set working directory ownership
WORKDIR /app
RUN chown -R fastify:nodejs /app

# Copy built artifacts from builder
COPY --from=builder --chown=fastify:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=fastify:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=fastify:nodejs /app/dist ./dist
COPY --from=builder --chown=fastify:nodejs /app/prisma ./prisma
COPY --from=builder --chown=fastify:nodejs /app/package.json ./

# Copy static files if they exist
COPY --from=builder --chown=fastify:nodejs /app/src/static ./src/static

# Switch to non-root user
USER fastify

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health/live || exit 1

# Start the server
CMD ["node", "dist/server.js"]

# ══════════════════════════════════════════════════════════════════════════════
# BUILD COMMANDS:
# ══════════════════════════════════════════════════════════════════════════════
#
# Build image:
#   docker build -t btpconnect-api:v9.3.0 .
#
# Run container:
#   docker run -d \
#     --name btpconnect-api \
#     -p 3000:3000 \
#     -e DATABASE_URL="mysql://user:pass@host:3306/db" \
#     -e JWT_ACCESS_SECRET="your-32-char-secret" \
#     -e JWT_REFRESH_SECRET="your-32-char-secret" \
#     btpconnect-api:v9.3.0
#
# Image size: ~200MB (vs ~500MB without multi-stage)
#
# ══════════════════════════════════════════════════════════════════════════════

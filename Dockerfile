# syntax=docker/dockerfile:1
# Amigo Production Dockerfile
# Optimized build with BuildKit cache mounts for fast deploys

# Single-stage build — cache mounts eliminate the need for a separate deps stage
FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files + prisma schema
COPY package.json package-lock.json* ./
COPY prisma ./prisma/

# Install deps with BuildKit cache mount — survives across builds
# npm cache + node_modules are persisted, so only new/changed packages install
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# Generate Prisma client
RUN npx prisma generate

# Copy source files
COPY . .

# Build the application with cached .next/cache for faster rebuilds
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

ARG NEXT_PUBLIC_BUILD_ID=dev
ARG NEXT_PUBLIC_BUILD_DATE=unknown
ENV NEXT_PUBLIC_BUILD_ID=$NEXT_PUBLIC_BUILD_ID
ENV NEXT_PUBLIC_BUILD_DATE=$NEXT_PUBLIC_BUILD_DATE

RUN --mount=type=cache,target=/app/.next/cache \
    npm run build

# Stage 3: Production Runner
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Install wget for healthcheck
RUN apk add --no-cache wget

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy necessary files from builder
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma

# Copy standalone build
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy Prisma client
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Copy pdfkit + deps (external package — needs .afm font data files at runtime)
COPY --from=builder /app/node_modules/pdfkit ./node_modules/pdfkit
COPY --from=builder /app/node_modules/fontkit ./node_modules/fontkit
COPY --from=builder /app/node_modules/linebreak ./node_modules/linebreak
COPY --from=builder /app/node_modules/png-js ./node_modules/png-js
COPY --from=builder /app/node_modules/js-md5 ./node_modules/js-md5
COPY --from=builder /app/node_modules/@noble ./node_modules/@noble

# Copy warmup script (pg is already in standalone node_modules)
COPY --from=builder /app/scripts/warmup-db.mjs ./warmup-db.mjs

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Warm up Neon DB before starting the server to avoid cold start on first request
CMD ["sh", "-c", "node warmup-db.mjs && node server.js"]

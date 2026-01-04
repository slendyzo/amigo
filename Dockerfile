# syntax=docker/dockerfile:1

# Amigo Production Dockerfile
# Optimized multi-stage build for Next.js 15 with Prisma
# Uses BuildKit cache mounts for faster rebuilds

# Stage 1: Dependencies (cached unless package.json changes)
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy only package files first (better cache hit rate)
COPY package.json package-lock.json* ./
COPY prisma ./prisma/

# Use cache mount for npm cache
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# Stage 2: Builder
FROM node:22-alpine AS builder
WORKDIR /app

# Copy deps from previous stage
COPY --from=deps /app/node_modules ./node_modules

# Copy prisma schema first (changes less often)
COPY prisma ./prisma/

# Generate Prisma client (cached if schema unchanged)
RUN npx prisma generate

# Copy source files (this layer invalidates on code changes)
COPY . .

# Build the application
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Build info args (passed from docker build)
# These are at the end to avoid cache invalidation
ARG NEXT_PUBLIC_BUILD_ID=dev
ARG NEXT_PUBLIC_BUILD_DATE=unknown
ENV NEXT_PUBLIC_BUILD_ID=$NEXT_PUBLIC_BUILD_ID
ENV NEXT_PUBLIC_BUILD_DATE=$NEXT_PUBLIC_BUILD_DATE

# Use cache mount for Next.js cache
RUN --mount=type=cache,target=/app/.next/cache \
    npm run build

# Stage 3: Production Runner
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

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

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]

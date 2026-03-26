# Amigo Production Dockerfile
# Optimized multi-stage build for Next.js 15 with Prisma

# Stage 1: Dependencies (cached unless package.json changes)
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy only package files first (better cache hit rate)
COPY package.json package-lock.json* ./
COPY prisma ./prisma/

RUN npm ci

# Stage 2: Builder
FROM node:22-alpine AS builder
WORKDIR /app

# Copy deps from previous stage
COPY --from=deps /app/node_modules ./node_modules

# Copy prisma schema first (changes less often)
COPY prisma ./prisma/

# Generate Prisma client
RUN npx prisma generate

# Copy source files (this layer invalidates on code changes)
COPY . .

# Build the application
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

ARG NEXT_PUBLIC_BUILD_ID=dev
ARG NEXT_PUBLIC_BUILD_DATE=unknown
ENV NEXT_PUBLIC_BUILD_ID=$NEXT_PUBLIC_BUILD_ID
ENV NEXT_PUBLIC_BUILD_DATE=$NEXT_PUBLIC_BUILD_DATE

RUN npm run build

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

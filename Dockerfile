# ============================================================
# Dockerfile for Railway deployment (Backend only)
# MySQL should be added as a Railway MySQL plugin/addon
# ============================================================

FROM node:18-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:18-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx tsc -p tsconfig.backend.json

FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/dist-backend ./dist-backend
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src/backend/uploads ./src/backend/uploads
COPY --from=builder /app/src/backend/database/init.sql ./init.sql

# Railway provides MYSQL* variables automatically
# Override with your own env vars in Railway dashboard
ENV PORT=5000
ENV BACKEND_PORT=5000

EXPOSE 5000

# Run migrate once, then start server
# The inline script waits for MySQL before migrating
CMD sh -c 'node dist-backend/index.js'

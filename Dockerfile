# ============================================================
# Dockerfile for Railway deployment (Backend only)
# MySQL should be added as a Railway MySQL plugin/addon
# ============================================================

FROM node:18-alpine AS deps
WORKDIR /app
COPY backend-package.json ./
RUN npm install

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

ENV PORT=5000

EXPOSE 5000

CMD ["node", "dist-backend/index.js"]

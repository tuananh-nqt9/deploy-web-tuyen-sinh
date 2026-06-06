# ============================================================
# Dockerfile for Railway deployment (Backend only)
# ============================================================

FROM node:18-alpine
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npx tsc -p tsconfig.backend.json

ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

CMD ["node", "dist-backend/index.js"]

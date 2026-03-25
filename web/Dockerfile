# ── Stage 1: Build the canonical Operational Architect frontend ──────────────
FROM node:22.14.0-alpine3.21 AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Stage 2: Serve with nginx + same-origin /api proxy ──────────────────────
FROM nginx:1.27.4-alpine

ENV API_UPSTREAM=http://backend:8000

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.default.conf.template /etc/nginx/templates/default.conf.template

EXPOSE 80

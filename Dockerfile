# ---- Build stage ----
FROM node:22-alpine AS build

WORKDIR /app

# Install ALL deps (devDeps needed for vite/tsc build)
COPY package.json package-lock.json* ./
RUN npm ci

# Vite client-side env (NO PAT — only the proxy origin and harmless vars).
# These get baked into the JS bundle and are publicly visible by design.
ARG VITE_API_BASE_URL=/api
ARG VITE_APP_PASSWORD
ARG VITE_LINK_CLAIMS_MASTER
ARG VITE_LINK_RESTORATION_OPS
ARG VITE_BRANDING_LABEL

# Copy source and build the SPA into ./dist
COPY . .
RUN npm run build

# ---- Runtime stage ----
FROM node:22-alpine

WORKDIR /app

# Install only runtime deps (express, dotenv, tsx for ts-on-the-fly).
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Bring built SPA + sidecar source from the build stage.
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server

ENV NODE_ENV=production
ENV PORT=80
EXPOSE 80

# Healthcheck — Coolify uses this to mark the container ready and to wire
# up its reverse proxy. /api/bases is a cheap GET that exercises the env
# (returns the resolved 3 base IDs) without touching Airtable.
RUN apk add --no-cache curl
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -fsS http://localhost:${PORT}/api/bases || exit 1

# tsx runs the TS sidecar directly. Server-side env (AIRTABLE_PAT,
# AIRTABLE_*_BASE, PROXY_SHARED_SECRET) must be supplied by the deployment.
CMD ["npx", "tsx", "server/index.ts"]

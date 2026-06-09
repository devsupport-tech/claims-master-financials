# ---- Build stage ----
FROM node:22-alpine AS build

WORKDIR /app

# Install ALL deps (devDeps needed for vite/tsc build)
COPY package.json package-lock.json* ./
RUN npm ci

# Vite client-side env (publishable values only — never secrets).
# These get baked into the JS bundle and are publicly visible by design.
ARG VITE_API_BASE_URL=/api
ARG VITE_APP_PASSWORD
ARG VITE_LINK_CLAIMS_MASTER
ARG VITE_LINK_RESTORATION_OPS
ARG VITE_BRANDING_LABEL
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY

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
# up its reverse proxy. /api/health is a cheap GET that doesn't touch any
# downstream service.
RUN apk add --no-cache curl
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -fsS http://localhost:${PORT}/api/health || exit 1

# tsx runs the TS sidecar directly. Server-side env (SUPABASE_URL,
# SUPABASE_SERVICE_ROLE_KEY, optional PROXY_SHARED_SECRET) must be supplied
# by the deployment.
CMD ["npx", "tsx", "server/index.ts"]

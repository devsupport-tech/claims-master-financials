# ---- Build stage ----
FROM node:22-alpine AS build

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json package-lock.json* ./
RUN npm ci

# Declare build args — Vite bakes VITE_* into the JS bundle at build time
ARG VITE_AIRTABLE_API_KEY
ARG VITE_AIRTABLE_BASE_ID
ARG VITE_APP_PASSWORD
ARG VITE_LINK_CLAIMS_MASTER
ARG VITE_LINK_RESTORATION_OPS

# Copy source and build
COPY . .
RUN npm run build

# ---- Serve stage ----
FROM nginx:alpine

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets from build stage
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

# PulseKeeper dashboard, served as static files by nginx.
#
# Built from the repository root:
#   docker build -f client/Dockerfile --build-arg VITE_API_URL=https://api.example.com -t pulsekeeper-web .

FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN npm ci --workspace client --include-workspace-root

COPY client ./client

# Vite inlines VITE_ variables at build time, so the API URL is a build
# argument rather than a runtime environment variable.
ARG VITE_API_URL=http://localhost:5050
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build --workspace client


FROM nginx:1.27-alpine AS runtime

COPY --from=build /app/client/dist /usr/share/nginx/html
COPY client/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1

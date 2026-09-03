# PulseKeeper API.
#
# Built from the repository root so the npm workspace resolves:
#   docker build -f server/Dockerfile -t pulsekeeper-api .

FROM node:22-alpine AS build
WORKDIR /app

# Manifests first: this layer is cached until a dependency actually changes,
# so a code-only edit does not reinstall the tree.
COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/

# The client workspace is not needed to build the server, but npm ci installs
# from the lockfile as a whole.
RUN npm ci --workspace server --include-workspace-root

COPY server ./server
RUN npm run build --workspace server


FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY server/package.json ./server/
RUN npm ci --omit=dev --workspace server --include-workspace-root && npm cache clean --force

COPY --from=build /app/server/dist ./server/dist

# Run unprivileged. The node image ships a `node` user for exactly this.
USER node

EXPOSE 5050

# Uses the readiness endpoint, so a container with no database is reported
# unhealthy rather than merely running.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5050)+'/api/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/dist/server.js"]

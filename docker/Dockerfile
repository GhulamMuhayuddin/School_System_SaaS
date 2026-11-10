# Nexora School ERP production image (Phase 20). Two targets: `api` and `web`.
#   docker build -f docker/Dockerfile --target api -t nexora-api .
#   docker build -f docker/Dockerfile --target web -t nexora-web .
# Written in Phase 20 and NOT built in the authoring environment (no Docker there): the first build on your server is the test.

FROM node:20-bookworm-slim AS builder
WORKDIR /app
ENV CI=true
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY . .
# postinstall builds @nexora/shared and runs `prisma generate` (downloads the Prisma engine: the build needs internet).
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @nexora/api build && pnpm --filter @nexora/web build

# ---- API ----
FROM node:20-bookworm-slim AS api
WORKDIR /app/apps/api
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate
# The whole workspace is copied (dev tools included) because the one-off `migrate` job needs prisma, tsx and pg from it.
COPY --from=builder --chown=node:node /app /app
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]

# ---- Web (static files + security headers) ----
FROM nginx:1.27-alpine AS web
COPY docker/nginx/web.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80

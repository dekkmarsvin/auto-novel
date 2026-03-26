FROM node:22.12-alpine AS deps
ENV PNPM_HOME="/pnpm"
ENV PNPM_STORE_PATH="/pnpm/store"
ENV PATH="$PNPM_HOME:$PATH"
RUN npm install -g pnpm@9
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/crawler/package.json ./packages/crawler/
COPY web/package.json ./web/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM deps AS builder
WORKDIR /app
COPY packages/crawler ./packages/crawler
COPY web ./web
RUN pnpm run build

FROM caddy:2.7.4
COPY web/Caddyfile /etc/caddy/Caddyfile
COPY --from=builder /app/web/dist /dist

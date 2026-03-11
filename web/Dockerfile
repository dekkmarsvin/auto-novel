FROM node:22-alpine AS deps
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY crawler/package.json ./crawler/
COPY web/package.json ./web/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM deps AS builder
WORKDIR /app
COPY crawler ./crawler
COPY web ./web
RUN pnpm run build

FROM caddy:2.7.4
COPY web/Caddyfile /etc/caddy/Caddyfile
COPY --from=builder /app/web/dist /dist

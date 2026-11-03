FROM node:22-bookworm-slim AS api
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.33.3 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
COPY apps/worker ./apps/worker
RUN pnpm install --frozen-lockfile --filter @gasscope/api... --filter @gasscope/worker...
EXPOSE 4000
CMD ["pnpm", "--filter", "@gasscope/api", "start"]

FROM node:22-bookworm-slim AS worker
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.33.3 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps/worker ./apps/worker
RUN pnpm install --frozen-lockfile --filter @gasscope/worker...
CMD ["pnpm", "--filter", "@gasscope/worker", "start"]

FROM node:22-bookworm-slim AS web
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.33.3 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
RUN pnpm install --frozen-lockfile --filter @gasscope/web...
RUN pnpm --filter @gasscope/web build
COPY apps/web/docker-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 3000
CMD ["/entrypoint.sh"]

FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --filter @news-aggregator/web --frozen-lockfile=false

FROM node:22-alpine
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY . .
EXPOSE 5173
CMD ["pnpm", "--filter", "@news-aggregator/web", "dev"]

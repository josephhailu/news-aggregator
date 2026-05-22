FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/db/package.json packages/db/package.json
RUN pnpm install --filter @news-aggregator/api... --frozen-lockfile=false

FROM node:22-alpine
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY . .
EXPOSE 4000
CMD ["pnpm", "--filter", "@news-aggregator/api", "start"]

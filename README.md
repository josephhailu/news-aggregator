# News Aggregator

A source-aware news aggregator built with React, TypeScript, Vite, Tailwind, Hono, Better Auth, Drizzle, PostgreSQL, and Docker.

The first ranking strategy follows the original product idea: collect a recent candidate set, then rank that set by normalized source-specific score. For example, the Hacker News adapter maps points, comments, age, and source rank into a local score instead of assuming every source has the same rating system. The Federal Reserve and Bank of Canada adapters start the finance/markets lane with official monetary-policy releases from RSS.

## Apps and Packages

- `apps/web`: React/Vite frontend.
- `apps/api`: Hono backend, Better Auth, ingestion and feed APIs.
- `packages/db`: Drizzle schema, database client, migrations.

## Local Development

For day-to-day building, use the hot-reload Docker setup:

```sh
pnpm dev
```

That uses `docker-compose.dev.yml`. PostgreSQL and Ollama run in Docker, and `api` and `web` run from plain Node containers in watch mode with the repo mounted into them. Frontend changes flow through Vite HMR, and backend changes restart automatically through `tsx watch`.

The first dev startup still needs to install dependencies into named volumes, but after that the normal edit loop should not require image rebuilds or stack restarts for ordinary code changes.

To follow the running app logs:

```sh
pnpm dev:logs
```

If you want the more deployment-like image stack for a packaging check, use:

```sh
pnpm stack:docker
```

That starts PostgreSQL, Ollama, the API, and the web app from built images. It is not the normal development path because source edits are copied into the image at build time, so you must rebuild to see changes. The `ollama-pull` setup service pulls `llama3.2:1b` the first time, so initial startup can take a while. The API container runs migrations and seeds the local dev account before starting.

The web app runs on `http://localhost:5173` and the API runs on `http://localhost:4000`.

### Manual Development

1. Copy `.env.example` to `.env` and adjust values if needed.
2. Install dependencies with `pnpm install`.
3. Start PostgreSQL with `pnpm infra:up`.
4. Generate and run migrations with `pnpm db:generate && pnpm db:migrate`.
5. Start Ollama with `ollama serve`.
6. Pull the model with `ollama pull llama3.2:1b`.
7. Seed a local operator account with `pnpm seed:dev-admin`.
8. Start the app with `pnpm dev`.

## Local Dev Account

The local seed command creates a Better Auth email/password account using the same registration path as the app:

```txt
email: admin@local.test
password: devpassword123
```

Override these with `DEV_ADMIN_EMAIL`, `DEV_ADMIN_PASSWORD`, and `DEV_ADMIN_NAME`. This account is seeded with the `admin` role and can use operational source refresh controls. New registered accounts default to the regular `user` role.

## Local AI

Fed article insights are generated in-house through an Ollama-compatible local model API. No OpenAI, Claude, or hosted model provider is required. Docker Compose handles Ollama and model pull automatically.

Manual local setup:

```sh
ollama pull llama3.2:1b
ollama serve
```

Then keep these env vars:

```sh
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2:1b
OLLAMA_KEEP_ALIVE=30m
OLLAMA_PREWARM=true
OLLAMA_CHAT_TIMEOUT_MS=240000
```

The API caches extracted article text and structured insights in PostgreSQL by article, model, and prompt version. On startup, the API also sends a tiny warm-up request to Ollama and asks Ollama to keep the configured model resident for `OLLAMA_KEEP_ALIVE`, which reduces first-request cold-start pain after the stack comes up. The UI only prefetches cached insights on hover; generation happens when you explicitly click `Analyze`.

For official policy sources, the read pipeline no longer treats the landing page as the only thing worth summarizing. Ingestion discovers a one-hop **Source Packet** from authoritative same-source links, packet members are stored explicitly, and the AI reads a cached **Packet Digest** that can prefer linked PDFs, statements, minutes, or reports over thin wrapper pages.

Source refreshes and feed refreshes require an admin user. AI generation and bookmarks require a signed-in user. Anonymous visitors can read feeds and cached insights.

## First Useful Calls

- `GET /health`
- `POST /api/ingest/hacker-news`
- `POST /api/ingest/federal-reserve`
- `POST /api/ingest/bank-of-canada`
- `POST /api/ingest/all`
- `GET /api/feeds/top-now`
- `GET /api/feeds/today`
- `GET /api/feeds/week`
- `GET /api/feeds/latest`
- `GET /api/articles/:articleId/insights/fed`
- `POST /api/articles/:articleId/insights/fed`

## Product Notes

User submissions are intentionally deferred, but the schema supports user-originated sources later through `source_type`. Comments/discussion are also deferred; bookmarks are the first authenticated user feature.

## Architecture Decisions

- [ADR 0001: Source Packet-Based Policy Macro Reads](./docs/adr/0001-source-packet-policy-macro-reads.md)

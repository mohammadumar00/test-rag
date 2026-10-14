# React Documentation RAG POC

This repository is the initial scaffold for a local Retrieval-Augmented Generation (RAG) proof of concept over React documentation. It deliberately contains no ingestion, embedding, retrieval, Qdrant, Ollama, or chat implementation yet.

## Structure

- `docs/` — source React documentation for a future indexer run.
- `apps/indexer/` — standalone document-indexing CLI; it never serves HTTP.
- `apps/api/` — Express API for future RAG queries. It currently provides `GET /health` only.
- `apps/web/` — React/Vite UI shell for the future chat experience.

## Prerequisites

- Node.js 20 or later
- Docker Compose (optional, for Qdrant)
- Ollama, with the configured embedding model downloaded

## Install and configure

```bash
npm install
cp .env.example .env
docker compose up -d qdrant
ollama pull nomic-embed-text
```

Qdrant is available locally at `http://localhost:6333`. Its storage is persisted in the Docker volume `qdrant_storage`.

## Run applications

Run these in separate terminals:

```bash
npm run dev:indexer
npm run dev:api
npm run dev:web
```

The API listens on `http://localhost:3001` by default; check it with `curl http://localhost:3001/health`. Vite prints its local URL when started.

## Index React documentation

Put official React reference Markdown files in `docs/`, configure Ollama and Qdrant values in `.env`, then run:

```bash
npm run start:indexer
```

The indexer reads the source files without modifying them, cleans presentation-only Markdown/MDX syntax, creates overlapping chunks, sends batches to Ollama's embedding API, and recreates the dedicated Qdrant collection before storing the current vectors. This reset avoids stale points after a document is changed or re-chunked.

Ollama must be running at the configured `OLLAMA_URL` (default `http://localhost:11434`) before indexing.

## Checks

```bash
npm run typecheck
npm run build
docker compose config
```

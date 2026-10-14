# React Documentation RAG POC

This repository is a local Retrieval-Augmented Generation (RAG) proof of concept over React documentation. It indexes local Markdown into Qdrant, then answers questions using retrieved context and a local Ollama model.

## Structure

- `docs/` — source React documentation for a future indexer run.
- `apps/indexer/` — standalone document-indexing CLI; it never serves HTTP.
- `apps/api/` — Express RAG API. It provides health and grounded chat endpoints.
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
ollama pull llama3.2
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

## Query the RAG API

Index the documents first, then send a question to the API:

```bash
curl -X POST http://localhost:3001/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"question":"How does useState initialize state?"}'
```

The response contains an `answer` grounded in the retrieved chunks and a `sources` array. `RAG_TOP_K` controls the number of Qdrant matches (default `4`); `RAG_MAX_CONTEXT_CHARACTERS` caps the prompt context (default `9000`). The API permits browser requests from the local Vite app for this POC.

## Use the web chat

With the API running, open the Vite URL printed by `npm run dev:web`. Enter a React documentation question, then use the linked source cards to inspect the retrieved reference sections. The web app calls `http://localhost:3001/api/chat` by default; set `VITE_API_URL` when the API is hosted elsewhere.

## Checks

```bash
npm run typecheck
npm run build
docker compose config
```

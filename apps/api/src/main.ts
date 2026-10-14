import dotenv from "dotenv";
import express from "express";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createChatRouter } from "./routes/chat.routes.js";

const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));
dotenv.config({ path: join(projectRoot, ".env") });

const app = express();
const configuredPort = Number(process.env.API_PORT ?? 3001);
const port = Number.isInteger(configuredPort) && configuredPort > 0 ? configuredPort : 3001;

app.use(express.json({ limit: "16kb" }));
app.use((_request, response, next) => {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});
app.options("/{*path}", (_request, response) => response.sendStatus(204));

app.get("/health", (_request, response) => {
  response.status(200).json({ status: "ok" });
});

app.use(
  "/api",
  createChatRouter({
    embedding: {
      baseUrl: requiredEnvironment("OLLAMA_URL", "http://localhost:11434"),
      model: requiredEnvironment("EMBEDDING_MODEL"),
    },
    generator: {
      baseUrl: requiredEnvironment("OLLAMA_URL", "http://localhost:11434"),
      model: requiredEnvironment("LLM_MODEL"),
    },
    qdrant: {
      baseUrl: requiredEnvironment("QDRANT_URL", "http://localhost:6333"),
      collectionName: requiredEnvironment("QDRANT_COLLECTION", "react_docs"),
    },
    retrievalLimit: positiveIntegerEnvironment("RAG_TOP_K", 4),
    maxContextCharacters: positiveIntegerEnvironment("RAG_MAX_CONTEXT_CHARACTERS", 9_000),
  }),
);

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  if (error instanceof SyntaxError && "body" in error) {
    response.status(400).json({ error: "Request body must contain valid JSON." });
    return;
  }

  console.error("Unhandled API error.", error);
  response.status(500).json({ error: "Unexpected API error." });
});

app.listen(port, () => {
  console.info(`API listening on http://localhost:${port}`);
});

function requiredEnvironment(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function positiveIntegerEnvironment(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

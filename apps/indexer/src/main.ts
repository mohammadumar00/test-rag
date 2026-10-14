import dotenv from "dotenv";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chunkDocuments } from "./chunking/chunker.js";
import { cleanMarkdownDocument } from "./ingestion/cleaner.js";
import { readMarkdownDocuments } from "./ingestion/reader.js";
import { embedTexts } from "./embeddings/embedder.js";
import { storeEmbeddedChunks } from "./storage/qdrant.js";

const DEFAULTS = {
  chunkSize: 1_200,
  chunkOverlap: 200,
  embeddingBatchSize: 16,
  upsertBatchSize: 32,
  sourceUrlBase: "https://react.dev/reference/react",
} as const;

const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));
dotenv.config({ path: join(projectRoot, ".env") });

async function main(): Promise<void> {
  // npm workspace scripts run from apps/indexer, so do not rely on process.cwd().
  const docsDirectory = join(projectRoot, "docs");
  const sourceDocuments = await readMarkdownDocuments({ docsDirectory });
  const documents = sourceDocuments.map(cleanMarkdownDocument);
  const chunks = chunkDocuments(documents, {
    maxChunkCharacters: readPositiveInteger("CHUNK_SIZE", DEFAULTS.chunkSize),
    overlapCharacters: readNonNegativeInteger("CHUNK_OVERLAP", DEFAULTS.chunkOverlap),
    sourceUrlForDocument: (document) => `${readEnvironment("SOURCE_URL_BASE", DEFAULTS.sourceUrlBase)}/${encodeURIComponent(document.title)}`,
  });

  if (chunks.length === 0) {
    throw new Error("No chunks were created from the documentation source.");
  }

  console.info(`Loaded ${documents.length} document(s) and created ${chunks.length} chunk(s).`);

  console.info(`Generating embeddings with Ollama model: ${readEnvironment("EMBEDDING_MODEL")}`);
  const embeddings = await embedTexts(
    chunks.map((chunk) => chunk.content),
    {
      baseUrl: readEnvironment("OLLAMA_URL", "http://localhost:11434"),
      model: readEnvironment("EMBEDDING_MODEL"),
      batchSize: readPositiveInteger("EMBEDDING_BATCH_SIZE", DEFAULTS.embeddingBatchSize),
    },
  );

  const result = await storeEmbeddedChunks(
    chunks.map((chunk, index) => ({ chunk, embedding: embeddings[index]! })),
    {
      baseUrl: readEnvironment("QDRANT_URL", "http://localhost:6333"),
      collectionName: readEnvironment("QDRANT_COLLECTION", "react_docs"),
      upsertBatchSize: readPositiveInteger("QDRANT_UPSERT_BATCH_SIZE", DEFAULTS.upsertBatchSize),
    },
  );

  console.info(
    `Stored ${result.storedPoints} vector(s) with ${result.vectorSize} dimensions in Qdrant collection "${result.collectionName}".`,
  );
}

main().catch((error: unknown) => {
  console.error("Indexer failed.", error);
  process.exitCode = 1;
});

function readEnvironment(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function readPositiveInteger(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function readNonNegativeInteger(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return value;
}

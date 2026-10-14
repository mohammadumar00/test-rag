import { createHash } from "node:crypto";
import type { DocumentChunk } from "../chunking/chunker.js";

export interface EmbeddedChunk {
  readonly chunk: DocumentChunk;
  readonly embedding: readonly number[];
}

export interface QdrantStorageOptions {
  readonly baseUrl: string;
  readonly collectionName: string;
  readonly upsertBatchSize: number;
}

export interface StoreResult {
  readonly collectionName: string;
  readonly vectorSize: number;
  readonly storedPoints: number;
}

/**
 * Recreates this POC's dedicated collection and stores the current corpus.
 * Recreating prevents removed or re-chunked documents from leaving stale vectors.
 */
export async function storeEmbeddedChunks(
  embeddedChunks: readonly EmbeddedChunk[],
  options: QdrantStorageOptions,
): Promise<StoreResult> {
  if (embeddedChunks.length === 0) {
    throw new Error("Cannot store an empty set of embedded chunks.");
  }
  if (!Number.isInteger(options.upsertBatchSize) || options.upsertBatchSize < 1) {
    throw new Error("Qdrant upsertBatchSize must be a positive integer.");
  }

  const vectorSize = validateEmbeddings(embeddedChunks);
  const collectionUrl = `${normalizeBaseUrl(options.baseUrl)}/collections/${encodeURIComponent(options.collectionName)}`;

  await recreateCollection(collectionUrl, vectorSize);

  for (const batch of intoBatches(embeddedChunks, options.upsertBatchSize)) {
    await upsertBatch(collectionUrl, batch);
  }

  return {
    collectionName: options.collectionName,
    vectorSize,
    storedPoints: embeddedChunks.length,
  };
}

function validateEmbeddings(embeddedChunks: readonly EmbeddedChunk[]): number {
  const vectorSize = embeddedChunks[0]?.embedding.length;
  if (!vectorSize) {
    throw new Error("Embeddings must contain at least one dimension.");
  }

  if (
    !embeddedChunks.every(
      ({ embedding }) =>
        embedding.length === vectorSize && embedding.every((value) => Number.isFinite(value)),
    )
  ) {
    throw new Error("All Qdrant embeddings must be finite vectors with the same dimension.");
  }

  return vectorSize;
}

async function recreateCollection(collectionUrl: string, vectorSize: number): Promise<void> {
  const existsResponse = await request(collectionUrl, { method: "GET" }, [200, 404]);
  if (existsResponse.status === 200) {
    await request(collectionUrl, { method: "DELETE" }, [200]);
  }

  await request(
    collectionUrl,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vectors: { size: vectorSize, distance: "Cosine" },
      }),
    },
    [200],
  );
}

async function upsertBatch(collectionUrl: string, batch: readonly EmbeddedChunk[]): Promise<void> {
  await request(
    `${collectionUrl}/points?wait=true`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        points: batch.map(({ chunk, embedding }) => ({
          id: qdrantPointId(chunk.id),
          vector: embedding,
          payload: {
            chunkId: chunk.id,
            documentId: chunk.documentId,
            documentTitle: chunk.documentTitle,
            relativePath: chunk.relativePath,
            sourceUrl: chunk.sourceUrl,
            section: chunk.section,
            content: chunk.content,
            chunkIndex: chunk.index,
          },
        })),
      }),
    },
    [200],
  );
}

async function request(
  url: string,
  init: RequestInit,
  expectedStatuses: readonly number[],
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    throw new Error(`Unable to connect to Qdrant at ${url}. Is Qdrant running?`, {
      cause: error,
    });
  }

  if (!expectedStatuses.includes(response.status)) {
    const responseBody = await response.text();
    throw new Error(`Qdrant request failed (${response.status}) at ${url}: ${responseBody}`);
  }

  return response;
}

function qdrantPointId(chunkId: string): string {
  const hash = createHash("sha256").update(chunkId).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

function intoBatches<T>(items: readonly T[], batchSize: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += batchSize) {
    batches.push(items.slice(index, index + batchSize));
  }
  return batches;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

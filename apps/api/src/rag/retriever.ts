import { searchPoints, type QdrantClientOptions, type QdrantSearchResult } from "../clients/qdrant.js";

export type RetrievedChunk = QdrantSearchResult;

export interface RetrieverOptions extends QdrantClientOptions {
  readonly limit: number;
}

/** Finds the most semantically relevant chunks from the indexed React documentation. */
export async function retrieveChunks(
  queryEmbedding: readonly number[],
  options: RetrieverOptions,
): Promise<RetrievedChunk[]> {
  return searchPoints(queryEmbedding, options.limit, options);
}

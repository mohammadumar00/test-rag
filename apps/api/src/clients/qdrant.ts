export interface QdrantClientOptions {
  readonly baseUrl: string;
  readonly collectionName: string;
}

export interface QdrantSearchResult {
  readonly chunkId: string;
  readonly documentId: string;
  readonly documentTitle: string;
  readonly relativePath: string;
  readonly sourceUrl: string;
  readonly section: string;
  readonly content: string;
  readonly chunkIndex: number;
  readonly score: number;
}

interface QdrantQueryResponse {
  readonly result?: { readonly points?: unknown };
}

/** Searches the collection created by the indexer, retaining only its known payload shape. */
export async function searchPoints(
  vector: readonly number[],
  limit: number,
  options: QdrantClientOptions,
): Promise<QdrantSearchResult[]> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("Qdrant search limit must be a positive integer.");
  }
  if (vector.length === 0 || !vector.every(Number.isFinite)) {
    throw new Error("Qdrant search requires a non-empty finite query vector.");
  }

  const url = `${baseUrl(options.baseUrl)}/collections/${encodeURIComponent(options.collectionName)}/points/query`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: vector, limit, with_payload: true, with_vector: false }),
    });
  } catch (error) {
    throw new Error(`Unable to connect to Qdrant at ${url}. Is Qdrant running?`, { cause: error });
  }

  if (!response.ok) {
    throw new Error(`Qdrant search failed (${response.status}): ${await response.text()}`);
  }

  let payload: QdrantQueryResponse;
  try {
    payload = (await response.json()) as QdrantQueryResponse;
  } catch (error) {
    throw new Error("Qdrant returned invalid JSON for the search request.", { cause: error });
  }

  if (!Array.isArray(payload.result?.points)) {
    throw new Error("Qdrant search response did not contain result points.");
  }

  return payload.result.points.flatMap(toSearchResult);
}

function toSearchResult(point: unknown): QdrantSearchResult[] {
  if (!isRecord(point) || !isRecord(point.payload) || typeof point.score !== "number" || !Number.isFinite(point.score)) {
    return [];
  }

  const payload = point.payload;
  const fields = [
    "chunkId",
    "documentId",
    "documentTitle",
    "relativePath",
    "sourceUrl",
    "section",
    "content",
  ] as const;
  if (!fields.every((field) => typeof payload[field] === "string") || typeof payload.chunkIndex !== "number") {
    return [];
  }

  return [{
    chunkId: payload.chunkId as string,
    documentId: payload.documentId as string,
    documentTitle: payload.documentTitle as string,
    relativePath: payload.relativePath as string,
    sourceUrl: payload.sourceUrl as string,
    section: payload.section as string,
    content: payload.content as string,
    chunkIndex: payload.chunkIndex,
    score: point.score,
  }];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function baseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

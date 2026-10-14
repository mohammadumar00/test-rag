export interface OllamaEmbedderOptions {
  readonly baseUrl: string;
  readonly model: string;
  readonly batchSize: number;
}

interface OllamaEmbedResponse {
  readonly embeddings: unknown;
}

/** Generates embeddings using Ollama's POST /api/embed endpoint. */
export async function embedTexts(
  texts: readonly string[],
  options: OllamaEmbedderOptions,
): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  if (!Number.isInteger(options.batchSize) || options.batchSize < 1) {
    throw new Error("Embedding batchSize must be a positive integer.");
  }

  const embeddings: number[][] = [];
  for (const batch of intoBatches(texts, options.batchSize)) {
    const response = await requestEmbeddings(batch, options);
    embeddings.push(...response);
  }

  validateEmbeddings(embeddings, texts.length);
  return embeddings;
}

async function requestEmbeddings(
  inputs: readonly string[],
  options: OllamaEmbedderOptions,
): Promise<number[][]> {
  const endpoint = `${normalizeBaseUrl(options.baseUrl)}/api/embed`;
  let response: Response;

  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: options.model, input: inputs, truncate: false }),
    });
  } catch (error) {
    throw new Error(`Unable to connect to Ollama at ${endpoint}. Is Ollama running?`, {
      cause: error,
    });
  }

  const responseBody = await response.text();
  if (!response.ok) {
    throw new Error(`Ollama embedding request failed (${response.status}): ${responseBody}`);
  }

  let payload: OllamaEmbedResponse;
  try {
    payload = JSON.parse(responseBody) as OllamaEmbedResponse;
  } catch (error) {
    throw new Error("Ollama returned an invalid JSON embedding response.", { cause: error });
  }

  if (!Array.isArray(payload.embeddings) || !payload.embeddings.every(isNumberVector)) {
    throw new Error("Ollama response does not contain valid numeric embeddings.");
  }

  if (payload.embeddings.length !== inputs.length) {
    throw new Error(
      `Ollama returned ${payload.embeddings.length} embeddings for ${inputs.length} inputs.`,
    );
  }

  return payload.embeddings;
}

function validateEmbeddings(embeddings: readonly number[][], expectedCount: number): void {
  if (embeddings.length !== expectedCount) {
    throw new Error(`Expected ${expectedCount} embeddings but received ${embeddings.length}.`);
  }

  const dimensions = embeddings[0]?.length;
  if (!dimensions || !embeddings.every((embedding) => embedding.length === dimensions)) {
    throw new Error("Ollama returned embeddings with inconsistent dimensions.");
  }
}

function isNumberVector(value: unknown): value is number[] {
  return Array.isArray(value) && value.length > 0 && value.every((entry) => typeof entry === "number" && Number.isFinite(entry));
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

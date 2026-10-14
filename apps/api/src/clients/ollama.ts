export interface OllamaClientOptions {
  readonly baseUrl: string;
  readonly model: string;
}

interface OllamaEmbedResponse {
  readonly embeddings: unknown;
}

interface OllamaGenerateResponse {
  readonly response: unknown;
}

/** Embed one query with the same model and API used by the indexer. */
export async function embedText(text: string, options: OllamaClientOptions): Promise<number[]> {
  const response = await requestOllama(`${baseUrl(options.baseUrl)}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: options.model, input: text, truncate: false }),
  });

  const payload = await parseJson<OllamaEmbedResponse>(response, "embedding");
  const embedding = Array.isArray(payload.embeddings) ? payload.embeddings[0] : undefined;
  if (!isNumberVector(embedding)) {
    throw new Error("Ollama embedding response did not contain a numeric vector.");
  }

  return embedding;
}

/** Generate a complete (non-streaming) answer from a grounded RAG prompt. */
export async function generateText(prompt: string, options: OllamaClientOptions): Promise<string> {
  const response = await requestOllama(`${baseUrl(options.baseUrl)}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: options.model, prompt, stream: false }),
  });

  const payload = await parseJson<OllamaGenerateResponse>(response, "generation");
  if (typeof payload.response !== "string") {
    throw new Error("Ollama generation response did not contain answer text.");
  }

  return payload.response.trim();
}

async function requestOllama(url: string, init: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    throw new Error(`Unable to connect to Ollama at ${url}. Is Ollama running?`, { cause: error });
  }

  if (!response.ok) {
    throw new Error(`Ollama request failed (${response.status}): ${await response.text()}`);
  }

  return response;
}

async function parseJson<T>(response: Response, operation: string): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch (error) {
    throw new Error(`Ollama returned invalid JSON for ${operation}.`, { cause: error });
  }
}

function isNumberVector(value: unknown): value is number[] {
  return Array.isArray(value) && value.length > 0 && value.every((entry) => typeof entry === "number" && Number.isFinite(entry));
}

function baseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

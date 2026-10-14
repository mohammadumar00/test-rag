import { Router, type Request, type Response } from "express";
import type { OllamaClientOptions } from "../clients/ollama.js";
import type { QdrantClientOptions } from "../clients/qdrant.js";
import { generateAnswer } from "../rag/generator.js";
import { buildGroundedPrompt } from "../rag/prompt-builder.js";
import { embedQuery } from "../rag/query-embedder.js";
import { retrieveChunks, type RetrievedChunk } from "../rag/retriever.js";

const MAX_QUESTION_CHARACTERS = 2_000;

export interface ChatRouterOptions {
  /** Query embedding must use the model that produced the indexed vectors. */
  readonly embedding: OllamaClientOptions;
  /** Generation uses the chat-capable local model. */
  readonly generator: OllamaClientOptions;
  readonly qdrant: QdrantClientOptions;
  readonly retrievalLimit: number;
  readonly maxContextCharacters: number;
}

/** Creates the public RAG endpoint: question → retrieve → grounded generation → sources. */
export function createChatRouter(options: ChatRouterOptions): Router {
  const router = Router();

  router.post("/chat", async (request, response) => {
    const question = questionFromRequest(request, response);
    if (!question) {
      return;
    }

    try {
      const queryEmbedding = await embedQuery(question, options.embedding);
      const chunks = await retrieveChunks(queryEmbedding, { ...options.qdrant, limit: options.retrievalLimit });
      const prompt = buildGroundedPrompt(question, chunks, {
        maxContextCharacters: options.maxContextCharacters,
      });
      const answer = await generateAnswer(prompt, options.generator);

      response.status(200).json({ answer, sources: sourcesForResponse(chunks) });
    } catch (error) {
      console.error("RAG chat request failed.", error);
      response.status(502).json({ error: "The local RAG services are unavailable or returned an invalid response." });
    }
  });

  return router;
}

function questionFromRequest(request: Request, response: Response): string | undefined {
  const question = isRecord(request.body) ? request.body.question : undefined;
  if (typeof question !== "string") {
    response.status(400).json({ error: 'Request body must be JSON with a string "question" field.' });
    return undefined;
  }

  const normalized = question.trim();
  if (!normalized || normalized.length > MAX_QUESTION_CHARACTERS) {
    response.status(400).json({ error: `Question must contain 1 to ${MAX_QUESTION_CHARACTERS} characters.` });
    return undefined;
  }

  return normalized;
}

function sourcesForResponse(chunks: readonly RetrievedChunk[]) {
  return chunks.map((chunk, index) => ({
    reference: index + 1,
    title: chunk.documentTitle,
    section: chunk.section,
    url: chunk.sourceUrl,
    score: chunk.score,
    excerpt: chunk.content.slice(0, 280),
  }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

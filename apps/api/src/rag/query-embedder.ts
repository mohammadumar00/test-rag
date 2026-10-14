import { embedText, type OllamaClientOptions } from "../clients/ollama.js";

/** Produces a query vector using the exact embedding-model configuration used by the indexer. */
export async function embedQuery(question: string, ollama: OllamaClientOptions): Promise<number[]> {
  if (!question.trim()) {
    throw new Error("Question cannot be empty.");
  }

  return embedText(question, ollama);
}

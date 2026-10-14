import { generateText, type OllamaClientOptions } from "../clients/ollama.js";

/** Requests a complete grounded answer from the configured local Ollama model. */
export async function generateAnswer(prompt: string, ollama: OllamaClientOptions): Promise<string> {
  const answer = await generateText(prompt, ollama);
  return answer || "I do not have enough information in the indexed documentation to answer that.";
}

import type { OllamaClientOptions } from "../clients/ollama.js";
import type { QdrantClientOptions } from "../clients/qdrant.js";
import { embedQuery } from "../rag/query-embedder.js";
import { retrieveChunks, type RetrievedChunk } from "../rag/retriever.js";

const EVALUATION_CASES = [
  { question: "What does useState return?", expectedDocumentId: "useState.md", expectedDocumentTitle: "useState" },
  { question: "How do I update state based on the previous state?", expectedDocumentId: "useState.md", expectedDocumentTitle: "useState" },
  { question: "When does useEffect run?", expectedDocumentId: "useEffect.md", expectedDocumentTitle: "useEffect" },
  { question: "How do I synchronize a component with an external system?", expectedDocumentId: "useEffect.md", expectedDocumentTitle: "useEffect" },
  { question: "How do I cache a calculation with useMemo?", expectedDocumentId: "useMemo.md", expectedDocumentTitle: "useMemo" },
  { question: "When should I use useMemo?", expectedDocumentId: "useMemo.md", expectedDocumentTitle: "useMemo" },
] as const;

export interface RetrievalEvaluationOptions {
  readonly embedding: OllamaClientOptions;
  readonly qdrant: QdrantClientOptions;
  readonly retrievalLimit: number;
}

export interface RetrievalEvaluation {
  readonly total: number;
  readonly hits: number;
  readonly hitRate: number;
  readonly topK: number;
  readonly results: readonly RetrievalEvaluationResult[];
}

export interface RetrievalEvaluationResult {
  readonly question: string;
  readonly expectedDocument: string;
  readonly hit: boolean;
  /** One-based position of the expected document among retrieved chunks. */
  readonly rank: number | null;
  readonly topMatch: { readonly title: string; readonly section: string; readonly score: number } | null;
}

/**
 * Measures retrieval hit rate against a known question-to-document benchmark.
 * Add representative failures to EVALUATION_CASES as the documentation set grows.
 */
export async function evaluateRetrieval(options: RetrievalEvaluationOptions): Promise<RetrievalEvaluation> {
  const results: RetrievalEvaluationResult[] = [];

  for (const testCase of EVALUATION_CASES) {
    const embedding = await embedQuery(testCase.question, options.embedding);
    const chunks = await retrieveChunks(embedding, { ...options.qdrant, limit: options.retrievalLimit });
    results.push(resultForCase(testCase, chunks));
  }

  const hits = results.filter((result) => result.hit).length;
  return {
    total: results.length,
    hits,
    hitRate: results.length === 0 ? 0 : (hits / results.length) * 100,
    topK: options.retrievalLimit,
    results,
  };
}

function resultForCase(
  testCase: (typeof EVALUATION_CASES)[number],
  chunks: readonly RetrievedChunk[],
): RetrievalEvaluationResult {
  const foundIndex = chunks.findIndex((chunk) => chunk.documentId === testCase.expectedDocumentId);
  const topMatch = chunks[0];

  return {
    question: testCase.question,
    expectedDocument: testCase.expectedDocumentTitle,
    hit: foundIndex >= 0,
    rank: foundIndex >= 0 ? foundIndex + 1 : null,
    topMatch: topMatch ? { title: topMatch.documentTitle, section: topMatch.section, score: topMatch.score } : null,
  };
}

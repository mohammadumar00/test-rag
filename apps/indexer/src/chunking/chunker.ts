import type { CleanDocument } from "../ingestion/cleaner.js";

export interface DocumentChunk {
  /** Stable identifier within the source document. */
  readonly id: string;
  readonly documentId: string;
  readonly documentTitle: string;
  readonly relativePath: string;
  readonly sourceUrl: string;
  readonly section: string;
  /** Text sent to Ollama and later used as LLM context. */
  readonly content: string;
  readonly index: number;
}

export interface ChunkingOptions {
  readonly maxChunkCharacters: number;
  readonly overlapCharacters: number;
  readonly sourceUrlForDocument: (document: CleanDocument) => string;
}

interface DocumentSection {
  readonly heading: string;
  readonly content: string;
}

/**
 * Splits cleaned documentation into heading-aware, overlapping chunks.
 * Character limits are intentional for this POC: they are deterministic and
 * keep each request comfortably below the embedding model context window.
 */
export function chunkDocuments(
  documents: readonly CleanDocument[],
  options: ChunkingOptions,
): DocumentChunk[] {
  validateOptions(options);

  return documents.flatMap((document) => chunkDocument(document, options));
}

function chunkDocument(document: CleanDocument, options: ChunkingOptions): DocumentChunk[] {
  const sourceUrl = options.sourceUrlForDocument(document);
  const sections = splitIntoSections(document);
  const chunks: DocumentChunk[] = [];

  for (const section of sections) {
    const contextPrefix = withContext(document.title, section.heading, "");
    const maxBodyCharacters = options.maxChunkCharacters - contextPrefix.length;
    if (maxBodyCharacters < 1) {
      throw new Error("maxChunkCharacters is too small to include required document metadata.");
    }

    const chunkBodies = splitContent(section.content, {
      ...options,
      maxChunkCharacters: maxBodyCharacters,
    });

    for (const chunkBody of chunkBodies) {
      const index = chunks.length;
      chunks.push({
        id: `${document.id}#${index}`,
        documentId: document.id,
        documentTitle: document.title,
        relativePath: document.relativePath,
        sourceUrl,
        section: section.heading,
        content: withContext(document.title, section.heading, chunkBody),
        index,
      });
    }
  }

  return chunks;
}

function validateOptions(options: ChunkingOptions): void {
  if (!Number.isInteger(options.maxChunkCharacters) || options.maxChunkCharacters < 1) {
    throw new Error("maxChunkCharacters must be a positive integer.");
  }

  if (
    !Number.isInteger(options.overlapCharacters) ||
    options.overlapCharacters < 0 ||
    options.overlapCharacters >= options.maxChunkCharacters
  ) {
    throw new Error("overlapCharacters must be a non-negative integer smaller than maxChunkCharacters.");
  }
}

function splitIntoSections(document: CleanDocument): DocumentSection[] {
  const sections: DocumentSection[] = [];
  let heading = document.title;
  let lines: string[] = [];

  const addSection = (): void => {
    const content = lines.join("\n").trim();
    if (content) {
      sections.push({ heading, content });
    }
  };

  for (const line of document.content.split("\n")) {
    const match = line.match(/^#{1,6}\s+(?<heading>.+?)\s*$/);

    if (match?.groups?.heading) {
      addSection();
      heading = removeReactHeadingAnchor(match.groups.heading);
      lines = [];
    } else {
      lines.push(line);
    }
  }

  addSection();
  return sections;
}

function removeReactHeadingAnchor(heading: string): string {
  return heading.replace(/\s*\{\/[^}]+\}\s*$/, "").trim();
}

function splitContent(content: string, options: ChunkingOptions): string[] {
  const blocks = content.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  const addChunk = (): void => {
    if (current) {
      chunks.push(current);
    }
  };

  for (const block of blocks) {
    if (!current) {
      current = block;
      continue;
    }

    const candidate = `${current}\n\n${block}`;
    if (candidate.length <= options.maxChunkCharacters) {
      current = candidate;
      continue;
    }

    addChunk();
    current = withOverlap(current, block, options.overlapCharacters);
  }

  addChunk();

  return chunks.flatMap((chunk) => splitOversizedChunk(chunk, options.maxChunkCharacters, options.overlapCharacters));
}

function withOverlap(previousChunk: string, nextBlock: string, overlapCharacters: number): string {
  if (overlapCharacters === 0) {
    return nextBlock;
  }

  const overlap = previousChunk.slice(-overlapCharacters).trimStart();
  return `${overlap}\n\n${nextBlock}`;
}

function splitOversizedChunk(chunk: string, maximum: number, overlap: number): string[] {
  if (chunk.length <= maximum) {
    return [chunk];
  }

  const parts: string[] = [];
  let start = 0;

  while (start < chunk.length) {
    const proposedEnd = Math.min(start + maximum, chunk.length);
    const end = findBoundary(chunk, start, proposedEnd);
    parts.push(chunk.slice(start, end).trim());

    if (end === chunk.length) {
      break;
    }

    start = Math.max(end - overlap, start + 1);
  }

  return parts;
}

function findBoundary(content: string, start: number, proposedEnd: number): number {
  if (proposedEnd === content.length) {
    return proposedEnd;
  }

  const boundary = Math.max(
    content.lastIndexOf("\n", proposedEnd),
    content.lastIndexOf(" ", proposedEnd),
  );

  return boundary > start ? boundary : proposedEnd;
}

function withContext(documentTitle: string, section: string, content: string): string {
  return `Document: ${documentTitle}\nSection: ${section}\n\n${content}`;
}

import { basename, extname } from "node:path";
import type { SourceDocument } from "./reader.js";

/**
 * A source document prepared for chunking. The original source file is never
 * changed; `content` exists only in the indexing pipeline's memory.
 */
export interface CleanDocument {
  readonly id: string;
  readonly filePath: string;
  readonly relativePath: string;
  readonly title: string;
  readonly content: string;
}

/**
 * Removes presentation-only document syntax while preserving Markdown prose,
 * headings, links, and code examples for semantic indexing.
 */
export function cleanMarkdownDocument(document: SourceDocument): CleanDocument {
  const normalizedSource = document.content.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const { frontmatter, body } = splitFrontmatter(normalizedSource);

  return {
    id: document.id,
    filePath: document.filePath,
    relativePath: document.relativePath,
    title: readTitle(frontmatter) ?? titleFromPath(document.relativePath),
    content: cleanBody(body),
  };
}

function splitFrontmatter(source: string): { frontmatter: string; body: string } {
  const match = source.match(/^---\n(?<frontmatter>[\s\S]*?)\n---(?:\n|$)/);

  if (!match?.groups?.frontmatter) {
    return { frontmatter: "", body: source };
  }

  return {
    frontmatter: match.groups.frontmatter,
    body: source.slice(match[0].length),
  };
}

function readTitle(frontmatter: string): string | undefined {
  const titleLine = frontmatter.match(/^title:\s*(?<title>.+?)\s*$/m);
  const title = titleLine?.groups?.title?.replace(/^(?:"|')|(?:"|')$/g, "").trim();

  return title || undefined;
}

function titleFromPath(relativePath: string): string {
  const fileName = basename(relativePath, extname(relativePath));
  return fileName.replace(/[-_]+/g, " ");
}

function cleanBody(body: string): string {
  const output: string[] = [];
  let insideCodeFence = false;
  let previousLineWasBlank = false;

  for (const line of body.split("\n")) {
    if (isCodeFence(line)) {
      insideCodeFence = !insideCodeFence;
      output.push(line);
      previousLineWasBlank = false;
      continue;
    }

    if (!insideCodeFence && isStandaloneMdxTag(line)) {
      continue;
    }

    // Preserve code exactly. Outside code, trailing whitespace adds no value to embeddings.
    const cleanedLine = insideCodeFence ? line : line.trimEnd();
    const isBlank = cleanedLine.length === 0;

    // Multiple blank lines outside code do not add semantic information.
    if (!insideCodeFence && isBlank && previousLineWasBlank) {
      continue;
    }

    output.push(cleanedLine);
    previousLineWasBlank = isBlank;
  }

  return output.join("\n").trim();
}

function isCodeFence(line: string): boolean {
  return /^\s*(?:`{3,}|~{3,})/.test(line);
}

/** Matches wrapper-only MDX tags such as <Intro>, </Note>, and <InlineToc />. */
function isStandaloneMdxTag(line: string): boolean {
  return /^\s*<\/?[A-Z][A-Za-z0-9]*(?:\s[^<>]*)?\/?\>\s*$/.test(line);
}

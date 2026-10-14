import { readdir, readFile, stat } from "node:fs/promises";
import { extname, relative, resolve, sep } from "node:path";

/**
 * A source document exactly as it was read from the local documentation set.
 * `content` is deliberately unmodified; cleaning belongs to the next pipeline step.
 */
export interface SourceDocument {
  /** Stable, portable path used later for metadata and source citations. */
  readonly id: string;
  /** Absolute path on the local machine. Do not expose this value to API clients. */
  readonly filePath: string;
  /** Path relative to the configured documentation directory, using `/` separators. */
  readonly relativePath: string;
  /** Original UTF-8 Markdown/MDX content. */
  readonly content: string;
}

export interface ReadMarkdownDocumentsOptions {
  /** Directory containing the Markdown documentation source files. */
  readonly docsDirectory: string;
}

/**
 * Recursively reads local Markdown documents in a deterministic order.
 *
 * Only regular `.md` files are included. Symlinks are intentionally ignored so
 * that the indexer cannot follow a documentation directory link outside its
 * configured source tree.
 */
export async function readMarkdownDocuments(
  options: ReadMarkdownDocumentsOptions,
): Promise<SourceDocument[]> {
  const docsDirectory = resolve(options.docsDirectory);
  await assertDirectoryExists(docsDirectory);

  const markdownPaths = await findMarkdownFiles(docsDirectory);

  return Promise.all(
    markdownPaths.map(async (filePath) => {
      try {
        const content = await readFile(filePath, "utf8");
        const relativePath = toPortableRelativePath(docsDirectory, filePath);

        return {
          id: relativePath,
          filePath,
          relativePath,
          content,
        };
      } catch (error) {
        throw new Error(`Unable to read documentation file: ${filePath}`, {
          cause: error,
        });
      }
    }),
  );
}

async function assertDirectoryExists(directoryPath: string): Promise<void> {
  try {
    const directoryStats = await stat(directoryPath);

    if (!directoryStats.isDirectory()) {
      throw new Error(`Documentation path is not a directory: ${directoryPath}`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Documentation path")) {
      throw error;
    }

    throw new Error(`Unable to access documentation directory: ${directoryPath}`, {
      cause: error,
    });
  }
}

async function findMarkdownFiles(directoryPath: string): Promise<string[]> {
  let entries;

  try {
    entries = await readdir(directoryPath, { withFileTypes: true });
  } catch (error) {
    throw new Error(`Unable to list documentation directory: ${directoryPath}`, {
      cause: error,
    });
  }

  const sortedEntries = [...entries].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  const nestedPaths = await Promise.all(
    sortedEntries.map(async (entry): Promise<string[]> => {
      const entryPath = resolve(directoryPath, entry.name);

      if (entry.isDirectory()) {
        return findMarkdownFiles(entryPath);
      }

      if (entry.isFile() && extname(entry.name).toLowerCase() === ".md") {
        return [entryPath];
      }

      return [];
    }),
  );

  return nestedPaths.flat();
}

function toPortableRelativePath(rootDirectory: string, filePath: string): string {
  return relative(rootDirectory, filePath).split(sep).join("/");
}

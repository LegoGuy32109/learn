// Every file that `deno task tools:generate` writes, as repo-relative path to content. The
// script writes them; a test regenerates them in memory and fails when the commit differs.
import { DIAGNOSTIC_CODES } from "../../shared/authoring/diagnostics.js";
import { diagnosticsMarkdown } from "./diagnostics-reference.ts";

const repo = new URL("../../../", import.meta.url);

const banner =
  "// Generated from src/shared/authoring/resolver.js by deno task tools:generate.\n// Inspectable, dependency-free lesson/v1 resolver for agents and local scripts.\n";

function declarations(): string {
  const union = DIAGNOSTIC_CODES.map((code) => `  | "${code}"`).join("\n");
  return `// Generated from src/shared/authoring/diagnostics.js by deno task tools:generate.
/** Every diagnostic code the resolver can emit. Documented at /api/v1/diagnostics and /docs/diagnostics.md. */
export type DiagnosticCode =
${union};
export interface Diagnostic { severity: "error" | "warning"; code: DiagnosticCode; path: string; message: string; }
export interface Resolution { valid: boolean; schemaVersion: 1; fingerprint: string | null; diagnostics: Diagnostic[]; normalizedLesson: Record<string, unknown> | null; }
export declare function resolveLesson(input: unknown): Promise<Resolution>;
export declare const lessonSchema: Record<string, unknown>;
export declare const MAX_DOCUMENT_BYTES: number;
export declare const MAX_DOCUMENT_DEPTH: number;
export declare const OPTION_COUNT: number;
export declare const CARD_WORDS_MIN: number;
export declare const CARD_WORDS_MAX: number;
export declare const OPTION_RATIO_MAX: number;
export declare const KEY_LONGEST_MAX: number;
export declare const DRAWABLE_MIN: number;
`;
}

export async function generatedFiles(): Promise<Record<string, string>> {
  const source = await Deno.readTextFile(
    new URL("src/shared/authoring/resolver.js", repo),
  );
  const humanDocs = await Deno.readTextFile(new URL("docs/api-v1.md", repo));
  const diagnostics = diagnosticsMarkdown();
  return {
    "public/tools/lesson-validator.js": banner + source,
    "public/tools/lesson-validator.d.ts": declarations(),
    "docs/diagnostics.md": diagnostics,
    "public/docs/diagnostics.md": diagnostics,
    "public/docs/api-v1.md": humanDocs,
  };
}

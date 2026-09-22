const source = await Deno.readTextFile(new URL("../src/shared/authoring/resolver.js", import.meta.url));
const banner = "// Generated from src/shared/authoring/resolver.js by deno task tools:generate.\n// Inspectable, dependency-free lesson/v1 resolver for agents and local scripts.\n";
await Deno.mkdir(new URL("../public/tools/", import.meta.url), { recursive: true });
await Deno.writeTextFile(new URL("../public/tools/lesson-validator.js", import.meta.url), banner + source);
await Deno.writeTextFile(new URL("../public/tools/lesson-validator.d.ts", import.meta.url), `export interface Diagnostic { severity: "error" | "warning"; code: string; path: string; message: string; }
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
`);
console.log("Generated public/tools/lesson-validator.js and lesson-validator.d.ts");

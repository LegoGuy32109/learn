export interface Diagnostic { severity: "error" | "warning"; code: string; path: string; message: string; }
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

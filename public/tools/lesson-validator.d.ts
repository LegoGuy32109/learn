export interface Diagnostic { severity: "error" | "warning"; code: string; path: string; message: string; }
export interface Resolution { valid: boolean; schemaVersion: 1; fingerprint: string | null; diagnostics: Diagnostic[]; normalizedLesson: Record<string, unknown> | null; }
export declare function resolveLesson(input: unknown): Promise<Resolution>;
export declare const lessonSchema: Record<string, unknown>;

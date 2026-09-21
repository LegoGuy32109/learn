// Redaction helpers for anything that might echo a bearer token: log lines,
// problem details, snapshots and test reports.

const PERSONAL_TOKEN = /learn_pat_([A-Za-z0-9_-]{10})_[A-Za-z0-9_-]+/g;
const BEARER_HEADER = /(Bearer\s+)[^\s"',;]+/gi;

/** Replace every personal token and bearer credential in `text` with a marker that keeps only the prefix. */
export function redactBearerTokens(text: string): string {
  return text
    .replace(PERSONAL_TOKEN, (_match, prefix: string) => `learn_pat_${prefix}_[redacted]`)
    .replace(BEARER_HEADER, (_match, keyword: string) => `${keyword}[redacted]`);
}

/** Render an unknown thrown value for a log line with any bearer token removed. */
export function redactedErrorText(error: unknown): string {
  const text = error instanceof Error ? `${error.name}: ${error.message}${error.stack ? `\n${error.stack}` : ""}` : String(error);
  return redactBearerTokens(text);
}

// Response and request helpers shared by every route group.

export const MAX_LESSON_BYTES = 1_000_000;

export function json(value: unknown, status = 200, headers: HeadersInit = {}): Response {
  const merged = { "content-type": "application/json; charset=utf-8", ...headers };
  return new Response(JSON.stringify(value), { status, headers: merged });
}

export function html(markup: string): Response {
  return new Response(markup, { headers: { "content-type": "text/html; charset=utf-8" } });
}

/** RFC 9457 problem details for transport, authentication, authorization and route errors. */
export function problem(status: number, title: string, detail: string): Response {
  const body = JSON.stringify({ type: "about:blank", title, status, detail });
  return new Response(body, { status, headers: { "content-type": "application/problem+json; charset=utf-8" } });
}

function tooLarge(): Response {
  return problem(413, "Request too large", `Lesson source is limited to ${MAX_LESSON_BYTES} bytes.`);
}

/** Parse one JSON body within the size limit, or return the problem response to send instead. */
export async function jsonBody(request: Request): Promise<unknown | Response> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_LESSON_BYTES) return tooLarge();
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_LESSON_BYTES) return tooLarge();
  try {
    return JSON.parse(text);
  } catch {
    return problem(400, "Invalid JSON", "The request body must contain one JSON lesson document.");
  }
}

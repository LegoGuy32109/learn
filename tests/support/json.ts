// Reading a JSON body in a test. Parsed JSON is `unknown` (types/strict-json.d.ts); a test names the
// reply shape it expects once, here, and its assertions then check that shape field by field.

/** A response body read as the shape the endpoint documents. */
export async function readJson<T>(response: Response): Promise<T> {
  return await response.json() as T;
}

/** A JSON text read as the shape it is expected to hold. */
export function parseJson<T>(text: string): T {
  return JSON.parse(text) as T;
}

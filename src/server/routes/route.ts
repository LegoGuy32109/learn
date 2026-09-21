// Route contract shared by the domain route groups and the composition point.

export type Params = Record<string, string>;

export interface Route {
  method: string;
  pattern: URLPattern;
  handle(request: Request, params: Params): Promise<Response>;
}

export function route(method: string, pathname: string, handle: Route["handle"]): Route {
  return { method, pattern: new URLPattern({ pathname }), handle };
}

/** Try each route in order. Returns null when none matches. */
export async function dispatch(routes: Route[], request: Request): Promise<Response | null> {
  for (const candidate of routes) {
    if (candidate.method !== request.method) continue;
    const match = candidate.pattern.exec(request.url);
    if (!match) continue;
    const params: Params = {};
    for (const [name, value] of Object.entries(match.pathname.groups)) {
      params[name] = value ?? "";
    }
    return await candidate.handle(request, params);
  }
  return null;
}

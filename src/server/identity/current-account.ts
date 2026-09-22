// One account identity for both credentials. A browser presents the session cookie;
// an agent presents a bearer token. Later tickets (shelf, sync) call this and never
// look at the cookie or the header themselves.

import type { Dependencies } from "../dependencies.ts";

export interface CurrentAccount {
  accountId: string;
  via: "cookie" | "bearer";
  displayName: string | null;
  scopes: string[];
}

/**
 * Resolve the account behind a request. The cookie wins when present and valid.
 * A bearer token must carry `requiredScope`; `forbidden` reports a valid token without it.
 */
export async function currentAccount(
  request: Request,
  dependencies: Pick<Dependencies, "auth" | "sessions">,
  requiredScope: string,
): Promise<CurrentAccount | { forbidden: true } | null> {
  const session = await dependencies.sessions.read(request);
  if (session) return { accountId: session.accountId, via: "cookie", displayName: session.displayName, scopes: [] };
  if (!request.headers.get("authorization")) return null;
  const result = await dependencies.auth.authenticate(request, requiredScope);
  if (result.ok) return { accountId: result.principal.accountId, via: "bearer", displayName: null, scopes: result.principal.scopes };
  if (result.reason === "forbidden") return { forbidden: true };
  return null;
}

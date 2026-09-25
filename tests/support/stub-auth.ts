// A bearer-token authenticator for database-free tests: each configured token maps to
// an account and a scope list, and everything else is unauthenticated.

import type { Authenticator, AuthResult } from "../../src/server/auth.ts";

export interface StubToken {
  accountId: string;
  scopes: string[];
  prefix?: string;
}

export function stubAuthenticator(
  tokens: Record<string, StubToken>,
): Authenticator {
  return {
    async authenticate(
      request: Request,
      requiredScope: string,
    ): Promise<AuthResult> {
      const header = request.headers.get("authorization") ?? "";
      const token = header.startsWith("Bearer ")
        ? tokens[header.slice(7).trim()]
        : undefined;
      if (!token) return { ok: false, reason: "unauthenticated" };
      if (!token.scopes.includes(requiredScope)) {
        return { ok: false, reason: "forbidden" };
      }
      return {
        ok: true,
        principal: {
          accountId: token.accountId,
          scopes: token.scopes,
          tokenPrefix: token.prefix,
        },
      };
    },
  };
}

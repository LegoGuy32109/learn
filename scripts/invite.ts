// Mint a one-time sign-in invite link for the owner account through the running site.
// Usage: deno task invite:mint [--base-url <url>] [--json]
// Reads LEARN_OWNER_TOKEN (an owner-scoped bearer token) and LEARN_BASE_URL from the
// environment. The link is printed once, works for ten minutes, and signs in one phone.

import { redactBearerTokens } from "../src/server/identity/redaction.ts";

const HELP = `Usage: deno task invite:mint [--base-url <url>] [--json]

Options:
  --base-url <url>   The site to ask. Defaults to LEARN_BASE_URL, then http://localhost:8000.
  --json             Print { url, path, expiresAt } as JSON instead of text.

The request uses LEARN_OWNER_TOKEN, which must carry the account:owner scope.
Open the printed link on the phone within ten minutes and register a passkey.`;

export interface InviteOptions {
  baseUrl: string;
  json: boolean;
  help: boolean;
}

export function parseInviteArgs(args: string[], environment: Record<string, string | undefined>): InviteOptions {
  const options: InviteOptions = { baseUrl: environment.LEARN_BASE_URL || "http://localhost:8000", json: false, help: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") options.help = true;
    else if (argument === "--json") options.json = true;
    else if (argument === "--base-url" || argument.startsWith("--base-url=")) {
      const value = argument.includes("=") ? argument.slice("--base-url=".length) : args[++index];
      if (!value) throw new Error("--base-url needs a value.");
      options.baseUrl = value;
    } else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

export async function mintInvite(baseUrl: string, token: string): Promise<{ url: string; path: string; expiresAt: number }> {
  const response = await fetch(new URL("/api/v1/sign-in-invites", baseUrl), { method: "POST", headers: { authorization: `Bearer ${token}` } });
  const body = await response.json().catch(() => ({}));
  if (response.status === 401) throw new Error("The token was rejected (401). Check LEARN_OWNER_TOKEN.");
  if (response.status === 403) throw new Error("The token lacks the account:owner scope (403). Mint one with deno task token:mint --scopes account:owner.");
  if (!response.ok) throw new Error(`The site answered ${response.status}: ${body.detail ?? body.title ?? "request failed"}`);
  return body;
}

if (import.meta.main) {
  try {
    const options = parseInviteArgs(Deno.args, { LEARN_BASE_URL: Deno.env.get("LEARN_BASE_URL") });
    if (options.help) {
      console.log(HELP);
    } else {
      const token = Deno.env.get("LEARN_OWNER_TOKEN");
      if (!token) throw new Error("LEARN_OWNER_TOKEN is not set. Run deno task db:owner or mint a token with the account:owner scope.");
      const minted = await mintInvite(options.baseUrl, token);
      if (options.json) {
        console.log(JSON.stringify(minted));
      } else {
        console.log(`Open this link on the phone within ten minutes. It works once:`);
        console.log("");
        console.log(`  ${minted.url}`);
        console.log("");
        console.log(`Expires ${new Date(minted.expiresAt).toISOString()}.`);
      }
    }
  } catch (error) {
    console.error(redactBearerTokens(error instanceof Error ? error.message : String(error)));
    Deno.exit(1);
  }
}

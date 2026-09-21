// Personal-token lifecycle for agent harnesses: mint, list, revoke, rotate.
// Usage: deno task token:<command> [options]   or   deno run ... scripts/tokens.ts <command> [options]
// The full token is printed once by mint and rotate. It is never stored or shown again.

import { createDb } from "../src/server/db.ts";
import { TokenAdmin, TokenAdminError, KNOWN_SCOPES, type TokenMetadata } from "../src/server/identity/token-admin.ts";
import { redactBearerTokens } from "../src/server/identity/redaction.ts";

const COMMANDS = ["mint", "list", "revoke", "rotate"] as const;
type Command = typeof COMMANDS[number];

const HELP: Record<Command | "general", string> = {
  general: `Usage: scripts/tokens.ts <command> [options]

Commands:
  mint     Create a named token with chosen scopes and an optional expiry.
  list     Show token metadata: name, prefix, scopes, created, last used, expiry, revoked.
  revoke   Revoke one token now.
  rotate   Replace one token with a fresh secret; the old one is revoked once the new one is confirmed.

Run a command with --help for its options. Every command accepts --account <id>
when the database holds more than one account, and --json for machine-readable output.`,
  mint: `Usage: deno task token:mint --name <name> --scopes <scope,...> [--expires-in <duration> | --expires-at <iso>] [--account <id>] [--json]

Options:
  --name <name>          Required. Unique among the account's active tokens (max 64 characters).
  --scopes <scope,...>   Required. Comma-separated. Known scopes: ${KNOWN_SCOPES.join(", ")}.
  --expires-in <dur>     Optional. Relative expiry such as 30m, 12h, 90d.
  --expires-at <iso>     Optional. Absolute expiry as an ISO-8601 timestamp.
  --account <id>         Optional when exactly one account exists.
  --json                 Print { token, metadata } as JSON instead of text.

The full token is printed once. Copy it now; it cannot be shown again.`,
  list: `Usage: deno task token:list [--all] [--account <id>] [--json]

Options:
  --all            Include revoked tokens. By default only unrevoked tokens are listed.
  --account <id>   Optional when exactly one account exists.
  --json           Print the metadata array as JSON.

Shows name, prefix, scopes, created, last used, expiry and revoked time. Hashes and secrets are never stored in a readable form and never shown.`,
  revoke: `Usage: deno task token:revoke (--prefix <prefix> | --name <name>) [--account <id>] [--json]

Options:
  --prefix <prefix>   The token prefix shown by token:list.
  --name <name>       The name of an active token, when it is unambiguous.
  --account <id>      Optional when exactly one account exists.
  --json              Print the revoked token's metadata as JSON.

Revocation is immediate. The next request with that token gets 401.`,
  rotate: `Usage: deno task token:rotate (--prefix <prefix> | --name <name>) [--account <id>] [--json]

Options:
  --prefix <prefix>   The token prefix shown by token:list.
  --name <name>       The name of an active token, when it is unambiguous.
  --account <id>      Optional when exactly one account exists.
  --json              Print { token, replacedPrefix, metadata } as JSON.

The replacement keeps the name, scopes and expiry. It is inserted and confirmed
in the database first; only then is the old token revoked. The new token is
printed once. If anything fails before confirmation the old token stays active.`,
};

interface Options {
  flags: Set<string>;
  values: Map<string, string>;
}

function parse(args: string[]): { command?: Command; options: Options } {
  const options: Options = { flags: new Set(), values: new Map() };
  let command: Command | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith("--")) {
      if (command) throw new UsageError(`Unexpected argument: ${argument}`);
      if (!(COMMANDS as readonly string[]).includes(argument)) throw new UsageError(`Unknown command: ${argument}`);
      command = argument as Command;
      continue;
    }
    const [name, inline] = argument.slice(2).split("=", 2);
    if (["help", "json", "all"].includes(name)) {
      options.flags.add(name);
      continue;
    }
    const value = inline ?? args[index + 1];
    if (value == null || value.startsWith("--")) throw new UsageError(`--${name} needs a value.`);
    if (inline == null) index += 1;
    options.values.set(name, value);
  }
  return { command, options };
}

class UsageError extends Error {}

const DURATION = /^(\d+)(m|h|d)$/;

export function parseDuration(text: string): number {
  const match = text.match(DURATION);
  if (!match) throw new UsageError(`Invalid duration "${text}". Use a number followed by m, h or d, such as 90d.`);
  const unit = { m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2] as "m" | "h" | "d"];
  return Number(match[1]) * unit;
}

function expiry(options: Options, now: number): number | null {
  const relative = options.values.get("expires-in");
  const absolute = options.values.get("expires-at");
  if (relative && absolute) throw new UsageError("Pass either --expires-in or --expires-at, not both.");
  if (relative) return now + parseDuration(relative);
  if (absolute) {
    const parsed = Date.parse(absolute);
    if (Number.isNaN(parsed)) throw new UsageError(`Invalid --expires-at "${absolute}". Use an ISO-8601 timestamp.`);
    return parsed;
  }
  return null;
}

function time(value: number | null): string {
  return value == null ? "-" : new Date(value).toISOString();
}

export function formatList(tokens: TokenMetadata[]): string {
  const header = ["name", "prefix", "scopes", "created", "last used", "expires", "revoked"];
  const rows = tokens.map((token) => [token.name, token.prefix, token.scopes.join(","), time(token.createdAt), time(token.lastUsedAt), time(token.expiresAt), time(token.revokedAt)]);
  const widths = header.map((column, index) => Math.max(column.length, ...rows.map((row) => row[index].length)));
  const line = (row: string[]) => row.map((cell, index) => cell.padEnd(widths[index])).join("  ").trimEnd();
  return [line(header), ...rows.map(line)].join("\n");
}

async function selectPrefix(admin: TokenAdmin, accountId: string, options: Options): Promise<string> {
  const prefix = options.values.get("prefix");
  const name = options.values.get("name");
  if (prefix && name) throw new UsageError("Pass either --prefix or --name, not both.");
  if (prefix) return prefix;
  if (!name) throw new UsageError("Pass --prefix <prefix> or --name <name>.");
  const found = await admin.find(accountId, { name });
  if (!found) throw new TokenAdminError(`No active token named "${name}" belongs to this account.`);
  return found.prefix;
}

export async function run(args: string[], admin: TokenAdmin, out: (line: string) => void): Promise<void> {
  const { command, options } = parse(args);
  if (!command) {
    out(HELP.general);
    if (!options.flags.has("help")) throw new UsageError("A command is required.");
    return;
  }
  if (options.flags.has("help")) {
    out(HELP[command]);
    return;
  }
  const json = options.flags.has("json");
  const account = await admin.resolveAccount(options.values.get("account"));

  if (command === "mint") {
    const name = options.values.get("name");
    const scopes = options.values.get("scopes");
    if (!name) throw new UsageError("--name is required.");
    if (!scopes) throw new UsageError("--scopes is required.");
    const minted = await admin.mint({ accountId: account.id, name, scopes: scopes.split(","), expiresAt: expiry(options, Date.now()) });
    if (json) {
      out(JSON.stringify(minted));
      return;
    }
    out(`Minted token "${minted.metadata.name}" (prefix ${minted.metadata.prefix}) for ${account.displayName}.`);
    out(`Scopes: ${minted.metadata.scopes.join(", ")}. Expires: ${time(minted.metadata.expiresAt)}.`);
    out("This is the only time the full token is shown:");
    out("");
    out(`  ${minted.token}`);
    out("");
    out("Give it to one agent harness as LEARN_TOKEN.");
    return;
  }

  if (command === "list") {
    const tokens = (await admin.list(account.id)).filter((token) => options.flags.has("all") || token.revokedAt == null);
    if (json) {
      out(JSON.stringify(tokens));
      return;
    }
    out(tokens.length ? formatList(tokens) : `No ${options.flags.has("all") ? "" : "active "}tokens for ${account.displayName}.`);
    return;
  }

  if (command === "revoke") {
    const revoked = await admin.revoke(account.id, await selectPrefix(admin, account.id, options));
    out(json ? JSON.stringify(revoked) : `Revoked token "${revoked.name}" (prefix ${revoked.prefix}) at ${time(revoked.revokedAt)}.`);
    return;
  }

  if (command === "rotate") {
    const rotated = await admin.rotate(account.id, await selectPrefix(admin, account.id, options));
    if (json) {
      out(JSON.stringify(rotated));
      return;
    }
    out(`Rotated token "${rotated.metadata.name}": prefix ${rotated.replacedPrefix} is revoked, prefix ${rotated.metadata.prefix} replaces it.`);
    out(`Scopes: ${rotated.metadata.scopes.join(", ")}. Expires: ${time(rotated.metadata.expiresAt)}.`);
    out("This is the only time the new token is shown:");
    out("");
    out(`  ${rotated.token}`);
    out("");
    return;
  }
}

if (import.meta.main) {
  const wantsHelp = Deno.args.includes("--help") || Deno.args.length === 0;
  try {
    if (wantsHelp) {
      await run(Deno.args, null as unknown as TokenAdmin, console.log);
    } else {
      await run(Deno.args, new TokenAdmin(createDb()), console.log);
    }
  } catch (error) {
    const message = error instanceof UsageError || error instanceof TokenAdminError ? error.message : redactBearerTokens(error instanceof Error ? error.message : String(error));
    console.error(redactBearerTokens(message));
    Deno.exit(error instanceof UsageError ? 2 : 1);
  }
}

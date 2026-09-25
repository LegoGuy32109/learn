// Helpers for the production audit (ticket 14). The base URL comes from LEARN_BASE_URL and the
// owner token from the `.env.prod` file itself, the way scripts/smoke-prod.ts reads it: Deno's
// --env-file never overrides a variable the parent process already set, so a caller that loaded
// `.env` would otherwise hand this suite the local token. LEARN_OWNER_TOKEN in the environment is
// the fallback when the file is absent. No token, cookie or invite link is ever printed; every
// piece of evidence goes through `redact` first.
import { parse } from "jsr:@std/dotenv@0.225.8/parse";
import { redactBearerTokens } from "../../src/server/identity/redaction.ts";
import fixture from "../../fixtures/lessons/browser-http-cache.json" with {
  type: "json",
};
import { check, observe } from "../audit/support.ts";

export const BASE = (Deno.env.get("LEARN_BASE_URL") ??
  "https://learn-joshhale.legoguy32109.deno.net").replace(/\/$/, "");
export const HOST = new URL(BASE).hostname;
export const REPO_ROOT = new URL("../../", import.meta.url).pathname;
export const SCREENSHOTS = new URL("./screenshots/", import.meta.url).pathname;
export const REPORT_PATH = new URL("./last-run.md", import.meta.url).pathname;
export const REVISION_HEADER = "x-learn-revision";

/** iPhone-sized Chromium with touch, a mobile user agent and a 3x screen, as a phone would present. */
export const PHONE = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  colorScheme: "light" as const,
};

/** Every value in .env.prod plus the owner token, parsed once. Values never leave this module unredacted. */
interface ProductionSecrets {
  ownerToken: string;
  /** Every non-trivial secret value the audit must never see in a response body. */
  values: string[];
  source: "file" | "environment";
}

let secrets: ProductionSecrets | null = null;

export async function productionSecrets(): Promise<ProductionSecrets> {
  if (secrets) return secrets;
  const envPath = Deno.env.get("LEARN_ENV_FILE") ?? `${REPO_ROOT}.env.prod`;
  let parsed: Record<string, string> = {};
  let source: ProductionSecrets["source"] = "file";
  try {
    parsed = parse(await Deno.readTextFile(envPath));
  } catch {
    source = "environment";
  }
  const ownerToken = parsed.LEARN_OWNER_TOKEN ||
    Deno.env.get("LEARN_OWNER_TOKEN") || "";
  if (!ownerToken) {
    throw new Error(
      "No owner token: put LEARN_OWNER_TOKEN in .env.prod (or LEARN_ENV_FILE) or the environment.",
    );
  }
  if (!parsed.LEARN_OWNER_TOKEN) source = "environment";
  // Only credentials count as secrets. The WebAuthn variables name this very host and appear in
  // every absolute link on purpose.
  const values = new Set<string>();
  for (const [key, value] of Object.entries(parsed)) {
    if (key.startsWith("WEBAUTHN_")) continue;
    if (
      key === "TURSO_DB_URL" ||
      (/TOKEN|KEY|SECRET/.test(key) && value.length >= 16)
    ) values.add(value);
  }
  values.add(ownerToken);
  const secretPart = ownerToken.split("_").at(-1) ?? "";
  if (secretPart.length >= 16) values.add(secretPart);
  secrets = { ownerToken, values: [...values].filter(Boolean), source };
  return secrets;
}

/** Remove every known secret and every token-shaped string from text before it is stored or printed. */
export function redact(text: string): string {
  let out = redactBearerTokens(text);
  if (secrets) {
    for (const value of secrets.values) {
      out = out.split(value).join("[redacted]");
    }
  }
  return out;
}

/** The titles this audit creates on production all start with `audit-`. */
export function auditTitle(suffix: string): string {
  return `audit-${
    new Date().toISOString().slice(0, 19).replaceAll(":", "-")
  }${suffix}`;
}

/** What the agent on the laptop sends: the fixture under another title and with no server-assigned IDs. */
export function lessonDocument(title: string): string {
  const lesson = structuredClone(fixture) as Record<string, unknown>;
  delete lesson.lessonId;
  delete lesson.revisionId;
  lesson.title = title;
  return JSON.stringify(lesson);
}

/** Everything this run created on production, listed in the report. Nothing is deleted. */
export const created: string[] = [];

/** Headers worth printing as evidence, in a fixed order. */
const EVIDENCE_HEADERS = [
  "content-type",
  "cache-control",
  "strict-transport-security",
  "access-control-allow-origin",
  "access-control-allow-credentials",
  "location",
  "set-cookie",
  "x-content-type-options",
  "content-security-policy",
  "referrer-policy",
  "x-frame-options",
  "permissions-policy",
  REVISION_HEADER,
  "cache-status",
  "age",
];

export const revisionsSeen = new Set<string>();

/** One line of evidence for a response: method, path, status and the headers that matter. */
export function describe(
  method: string,
  path: string,
  response: Response,
  extra: string[] = [],
): string {
  const revision = response.headers.get(REVISION_HEADER);
  if (revision) revisionsSeen.add(revision);
  const headers = EVIDENCE_HEADERS
    .filter((name) => response.headers.has(name))
    .map((name) =>
      `${name}: ${
        name === "set-cookie"
          ? cookieAttributes(response.headers.get(name) ?? "")
          : response.headers.get(name)
      }`
    );
  return redact(
    [`${method} ${path} -> ${response.status}`, ...headers, ...extra].join(
      "\n",
    ),
  );
}

/** A Set-Cookie value with the cookie's value removed, so its attributes can be printed. */
export function cookieAttributes(setCookie: string): string {
  return setCookie.replace(/^([^=]+)=[^;]*/, "$1=[redacted]");
}

export interface Probe {
  response: Response;
  text: string;
  evidence: string;
}

/** Fetch one path on production without following redirects, keeping the body for scanning. */
export async function probe(
  path: string,
  init: RequestInit = {},
  base = BASE,
): Promise<Probe> {
  const method = init.method ?? "GET";
  const response = await fetch(`${base}${path}`, {
    redirect: "manual",
    ...init,
  });
  const text = await response.text();
  const probeResult = {
    response,
    text,
    evidence: describe(method, path, response),
  };
  recordBody(`${method} ${base}${path}`, response.status, text);
  return probeResult;
}

/** Every response body the audit saw, for the secret scan. */
export const bodies: { source: string; status: number; text: string }[] = [];

export function recordBody(source: string, status: number, text: string) {
  if (text.length === 0) return;
  bodies.push({ source, status, text: text.slice(0, 2_000_000) });
}

/** Attach a body recorder to a Playwright page: every same-origin text response is kept for the scan. */
export function recordPageBodies(page: any, label: string) {
  page.on("response", async (response: any) => {
    try {
      const url = new URL(response.url());
      if (url.origin !== BASE) return;
      const type = response.headers()["content-type"] ?? "";
      if (!/json|text|javascript|html|manifest|markdown/.test(type)) return;
      const text = await response.text();
      recordBody(
        `${label}: ${response.request().method()} ${url.pathname}`,
        response.status(),
        text,
      );
    } catch {
      // A redirected or aborted response has no body to read; nothing to scan.
    }
  });
}

const TOKEN_SHAPES: { name: string; pattern: RegExp }[] = [
  {
    name: "personal token with a secret",
    pattern: /learn_pat_[A-Za-z0-9]+_[A-Za-z0-9_-]{16,}/,
  },
  {
    name: "JWT",
    pattern: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  },
  { name: "libsql URL", pattern: /libsql:\/\/[^\s"']+/ },
  { name: "Turso variable", pattern: /TURSO_(DB_URL|DB_TOKEN|API_KEY)\s*[=:]/ },
  { name: "session key variable", pattern: /LEARN_SESSION_KEY\s*[=:]/ },
  { name: "session cookie value", pattern: /learn_session=v1\./ },
];

/** Scan every recorded body for a known secret value or a token-shaped string. Returns problems, redacted. */
export function scanBodies(known: string[]): string[] {
  const problems: string[] = [];
  for (const body of bodies) {
    for (const value of known) {
      if (body.text.includes(value)) {
        problems.push(
          `${body.source} (${body.status}) contains a value from .env.prod`,
        );
      }
    }
    for (const shape of TOKEN_SHAPES) {
      const match = body.text.match(shape.pattern);
      if (match) {
        problems.push(
          `${body.source} (${body.status}) contains a ${shape.name}: ${
            redact(match[0]).slice(0, 60)
          }`,
        );
      }
    }
  }
  return [...new Set(problems)];
}

let shot = 0;

/** Screenshot the page into the production screenshots directory and return the path for evidence. */
export async function snap(page: any, name: string): Promise<string> {
  shot += 1;
  const file = `${SCREENSHOTS}${String(shot).padStart(2, "0")}-${
    name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()
  }.jpg`;
  await page.screenshot({
    path: file,
    type: "jpeg",
    quality: 60,
    fullPage: true,
  });
  return `screenshot: ${file.slice(REPO_ROOT.length)}`;
}

/** A page's IndexedDB store, read whole. */
export async function readStore(page: any, store: string): Promise<any[]> {
  return await page.evaluate(
    (name: string) =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("learn-local-v1");
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(name)) return resolve([]);
          const read = db.transaction(name, "readonly").objectStore(name)
            .getAll();
          read.onsuccess = () => resolve(read.result);
          read.onerror = () => reject(read.error);
        };
        request.onerror = () => reject(request.error);
      }),
    store,
  );
}

/** Mint a one-time invite the way Josh does: `deno task invite:mint` pointed at production. The link is never printed. */
export async function mintInviteWithTask(): Promise<
  { url: string; path: string; expiresAt: number }
> {
  const { ownerToken } = await productionSecrets();
  const command = new Deno.Command("deno", {
    args: ["task", "invite:mint", "--json", "--base-url", BASE],
    cwd: REPO_ROOT,
    env: { LEARN_OWNER_TOKEN: ownerToken, LEARN_BASE_URL: BASE },
    stdout: "piped",
    stderr: "piped",
  });
  const output = await command.output();
  const stdout = new TextDecoder().decode(output.stdout);
  const stderr = new TextDecoder().decode(output.stderr);
  if (!output.success) {
    throw new Error(
      `deno task invite:mint failed (${output.code}): ${
        redact(stderr.trim() || stdout.trim())
      }`,
    );
  }
  const line = stdout.trim().split("\n").findLast((candidate) =>
    candidate.startsWith("{")
  );
  if (!line) {
    throw new Error(
      `deno task invite:mint printed no JSON: ${redact(stdout.slice(0, 200))}`,
    );
  }
  const minted = JSON.parse(line);
  if (
    typeof minted.url !== "string" || !minted.url.startsWith(`${BASE}/sign-in/`)
  ) throw new Error("invite:mint returned an unexpected link");
  return minted;
}

/** True when a body looks like a stack trace or an unhandled server error rather than a designed page. */
export function looksLikeStackTrace(text: string): boolean {
  return /\n\s+at\s+\S+ \(|Internal Server Error|TypeError:|ReferenceError:|Deno\.errors/
    .test(text);
}

export { check, observe };

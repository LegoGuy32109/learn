// Ticket 13 audit helpers. Nothing here imports the project's resolver for an expectation:
// the expectations come from the committed manifest, the served diagnostics catalog and an
// independent draft 2020-12 validator. The project's resolver is imported only as one of the
// three implementations under comparison.

/**
 * The site under attack. `LEARN_BASE_URL=local` serves the database-free application in this
 * process, so CI compares the resolver, the downloaded validator and the schema without touching
 * a deployment. Anything else is an origin; the default is the deployed site.
 */
function siteUnderAttack(): string {
  const configured = Deno.env.get("LEARN_BASE_URL");
  if (configured !== "local") {
    return (configured ?? "https://learn-joshhale.legoguy32109.deno.net")
      .replace(/\/$/, "");
  }
  // The application loads on the first request: importing it here, while the test module that
  // imports this one is still initializing, would be a cycle.
  const server = Deno.serve(
    { hostname: "127.0.0.1", port: 0, onListen() {} },
    async (request) => (await import("../../../src/app.ts")).app(request),
  );
  server.unref();
  return `http://127.0.0.1:${server.addr.port}`;
}

export const ORIGIN = siteUnderAttack();

export interface Result {
  name: string;
  ok: boolean;
  detail?: string;
}

export interface Observation {
  name: string;
  detail: string;
}

export const results: Result[] = [];
export const observations: Observation[] = [];

/** Run one named check. A failure is recorded, not thrown, so the audit keeps walking. */
export async function check(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    results.push({ name, ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      name,
      ok: false,
      detail: message.split("\n").filter((line) => line.trim()).slice(0, 10)
        .join("\n"),
    });
  }
}

export function observe(name: string, detail: string) {
  observations.push({ name, detail });
}

export function equal(actual: unknown, expected: unknown, what: string) {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) {
    throw new Error(`${what}\n  actual:   ${left}\n  expected: ${right}`);
  }
}

export function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

export function report(title: string): string {
  const passed = results.filter((result) => result.ok).length;
  const failed = results.filter((result) => !result.ok);
  const lines = [
    `## ${title}`,
    "",
    `${passed} passed, ${failed.length} failed, ${observations.length} observations`,
    "",
  ];
  if (failed.length) {
    lines.push("### Failed", "");
    for (const result of failed) {
      lines.push(`- ${result.name}`);
      if (result.detail) {
        lines.push(
          "  ```",
          ...result.detail.split("\n").map((line) => `  ${line}`),
          "  ```",
        );
      }
    }
    lines.push("");
  }
  if (observations.length) {
    lines.push("### Observations", "");
    for (const observation of observations) {
      lines.push(`- **${observation.name}** — ${observation.detail}`);
    }
    lines.push("");
  }
  lines.push("### Passed", "");
  for (const result of results.filter((result) => result.ok)) {
    lines.push(`- ${result.name}`);
  }
  return lines.join("\n");
}

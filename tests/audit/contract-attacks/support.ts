// Ticket 13 audit helpers. Nothing here imports the project's resolver for an expectation:
// the expectations come from the committed manifest, the served diagnostics catalog and an
// independent draft 2020-12 validator. The project's resolver is imported only as one of the
// three implementations under comparison.

export const ORIGIN = (Deno.env.get("LEARN_BASE_URL") ?? "https://learn-joshhale.legoguy32109.deno.net").replace(/\/$/, "");

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
    results.push({ name, ok: false, detail: message.split("\n").filter((line) => line.trim()).slice(0, 10).join("\n") });
  }
}

export function observe(name: string, detail: string) {
  observations.push({ name, detail });
}

export function equal(actual: unknown, expected: unknown, what: string) {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) throw new Error(`${what}\n  actual:   ${left}\n  expected: ${right}`);
}

export function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

export function report(title: string): string {
  const passed = results.filter((result) => result.ok).length;
  const failed = results.filter((result) => !result.ok);
  const lines = [`## ${title}`, "", `${passed} passed, ${failed.length} failed, ${observations.length} observations`, ""];
  if (failed.length) {
    lines.push("### Failed", "");
    for (const result of failed) {
      lines.push(`- ${result.name}`);
      if (result.detail) lines.push("  ```", ...result.detail.split("\n").map((line) => `  ${line}`), "  ```");
    }
    lines.push("");
  }
  if (observations.length) {
    lines.push("### Observations", "");
    for (const observation of observations) lines.push(`- **${observation.name}** — ${observation.detail}`);
    lines.push("");
  }
  lines.push("### Passed", "");
  for (const result of results.filter((result) => result.ok)) lines.push(`- ${result.name}`);
  return lines.join("\n");
}

// The human page at /plugin: what the agent plugin does and the three ways to install it.
// Every URL is absolute on the request origin, so the page reads the same on a preview host.
import { MARKETPLACE_NAME, PLUGIN_NAME, PLUGIN_VERSION, pluginLinks, SKILL_NAME } from "../plugin/links.ts";
import { document, escapeHtml } from "./page.ts";

function code(text: string): string {
  return `<pre class="plugin-code"><code>${escapeHtml(text)}</code></pre>`;
}

function link(href: string, text = href): string {
  return `<a href="${escapeHtml(href)}">${escapeHtml(text)}</a>`;
}

const STYLE = `<style>
.plugin{gap:26px}
.plugin h1{font-size:calc(var(--a-fs)*1.7);line-height:1.15;margin:6px 0 0}
.plugin h2{font-size:calc(var(--a-fs)*1.15);margin:0 0 8px}
.plugin p,.plugin li{color:var(--a-ink-2);line-height:1.5}
.plugin section{padding:16px;background:var(--a-surface);border:1px solid var(--a-line);border-radius:var(--a-r)}
.plugin-code{margin:10px 0 0;padding:12px;overflow-x:auto;background:var(--a-codebg);color:var(--a-codeink);border-radius:var(--a-r);font-family:var(--a-mono);font-size:13px;line-height:1.5}
.plugin a{color:var(--a-acc);word-break:break-all}
.plugin ol{padding-left:22px;margin:0}
.plugin footer{color:var(--a-ink-3);font-family:var(--a-mono);font-size:11px;text-transform:uppercase}
</style>`;

export function pluginPage(origin: string): string {
  const links = pluginLinks(origin);
  const capabilities = new URL("/api/v1/capabilities", origin).href;
  const body = [
    '<main id="app" class="page plugin">',
    `<div><p class="eyebrow">Agent plugin</p><h1>Make a lesson from the work you just did</h1></div>`,
    `<p>Install the <code>${PLUGIN_NAME}</code> plugin in any Claude Code session. Its one skill, <code>${SKILL_NAME}</code>, reads the work the agent just did, writes a <code>lesson.json</code>, attacks its own draft, validates it with this site's own validator and creates a private draft here with your bearer token. You get a URL that opens on your phone.</p>`,
    "<section><h2>1. Claude Code plugin</h2><p>Add this site's marketplace, then install the plugin. The marketplace names one plugin whose source is the archive below, pinned by its SHA-256.</p>",
    code(`claude plugin marketplace add ${links.marketplace}\nclaude plugin install ${PLUGIN_NAME}@${MARKETPLACE_NAME}`),
    "</section>",
    "<section><h2>2. Clone the plugin directory</h2><p>The site serves the plugin as a Git repository. Clone it and point Claude Code at the directory, or download the archive and unpack it.</p>",
    code(`git clone ${links.repository}\nclaude --plugin-dir ./learn-lesson-plugin`),
    `<p>Archive: ${link(links.archive)}</p>`,
    "</section>",
    `<section><h2>3. Copy the one skill</h2><p>Everything the skill needs is inside <code>skills/${SKILL_NAME}/</code>: the instructions, the authoring rules, the schema and diagnostics references, the bundled validator and two scripts. Copy that directory into <code>~/.claude/skills/${SKILL_NAME}</code> and the skill is available without the plugin. The scripts run under Node 20+ or Deno.</p>`,
    `<p>Start from ${link(links.skill, "SKILL.md")}.</p>`,
    "</section>",
    "<section><h2>The token</h2><p>The skill reads your bearer token from the <code>LEARN_TOKEN</code> environment variable of the shell that runs the agent. It never prints the token, never writes it into a lesson or a log and never passes it on a command line. Mint one with the <code>lessons:write</code> scope using the site's <code>token:mint</code> task.</p>",
    code("export LEARN_TOKEN=learn_pat_...   # in the shell, never in the chat"),
    "</section>",
    `<section><h2>Generated from the contract</h2><p>Every text in the plugin is generated from this site's resolver, JSON Schema and diagnostics catalog, so the plugin cannot disagree with the server. The machine-readable entry point is ${link(capabilities)}. Plugin version ${escapeHtml(PLUGIN_VERSION)}.</p></section>`,
    `<footer>${link(new URL("/", origin).href, "Shelf")} · ${link(new URL("/docs/api-v1.md", origin).href, "API docs")}</footer>`,
    "</main>",
  ].join("");
  return document(STYLE + body, { title: "Agent plugin" });
}

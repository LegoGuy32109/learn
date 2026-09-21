#!/usr/bin/env node
// lesson.json + the fixed renderer -> a fragment ready to paste into show_widget.
// Also emits a standalone wrapper so the fragment can be opened and smoke-tested
// before it ever reaches the chat.
//
//   node build.mjs path/to/lesson.json [outdir]
//
// Writes <outdir>/fragment.html   (paste this into show_widget)
//        <outdir>/preview.html    (open locally / drive with Playwright)

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const lessonPath = process.argv[2];
const outDir = resolve(process.argv[3] || ".");
if (!lessonPath) { console.error("usage: build.mjs <lesson.json> [outdir]"); process.exit(2); }

const lesson = JSON.parse(readFileSync(lessonPath, "utf8"));
const renderer = readFileSync(join(here, "..", "assets", "renderer.html"), "utf8");

const sro = `Interactive lesson on ${lesson.title}, with cards, three-option questions, feedback and a wrap-up.`;

// JSON.stringify never emits a raw newline or an unescaped quote, so the data
// cannot break out of the script tag the way hand-written string literals can.
// </script> inside content is the one exception worth guarding.
const data = JSON.stringify(lesson).replace(/<\/script/gi, "<\\/script");

const fragment = renderer
  .replace("__SRO__", sro.replace(/[<>&]/g, ""))
  .replace("__LESSON__", data);

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "fragment.html"), fragment);
writeFileSync(join(outDir, "preview.html"),
  '<!doctype html><meta charset="utf-8"><title>' +
  lesson.title.replace(/[<>&]/g, "") +
  '</title><body style="margin:0;padding:20px;background:#fff;color:#1c1c1a;' +
  'font-family:system-ui,sans-serif;max-width:680px">' + fragment + "</body>");

const items = lesson.concepts.reduce((n, c) => n + c.pool.length, 0);
console.log(`built ${lesson.concepts.length} concepts, ${items} items`);
console.log(`  ${join(outDir, "fragment.html")}  -> paste into show_widget`);
console.log(`  ${join(outDir, "preview.html")}   -> open or drive with Playwright`);

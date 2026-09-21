#!/usr/bin/env node
// Mechanical checks on a lesson.json. Every rule here is one a model will
// violate while sincerely believing it complied. Judgment rules live in
// references/authoring.md and are deliberately NOT checked here.
//
//   node validate.mjs path/to/lesson.json
//
// Exit 0 = clean. Exit 1 = at least one FAIL.

import { readFileSync } from "node:fs";

const path = process.argv[2];
if (!path) { console.error("usage: validate.mjs <lesson.json>"); process.exit(2); }

const L = JSON.parse(readFileSync(path, "utf8"));
let fails = 0, warns = 0;
const FAIL = (m) => { console.log("FAIL  " + m); fails++; };
const WARN = (m) => { console.log("WARN  " + m); warns++; };

const CARD_MIN = 120, CARD_MAX = 200;
const RATIO_MAX = 1.35;          // longest option vs shortest, within a concept's set
const KEY_LONGEST_MAX = 1 / 3;   // lesson-wide rate, NOT per item (see note below)
const DEIXIS = /\b(the (second|third|other|above|former|latter)|besides the|other than the|this approach|as mentioned|that same|the previous)\b/i;

if (!L.title) FAIL("lesson has no title");
if (!Array.isArray(L.concepts) || !L.concepts.length) { FAIL("lesson has no concepts"); process.exit(1); }

const ids = new Set();
let mcqCount = 0, keyLongest = 0;

for (const c of L.concepts) {
  const at = (s) => `concept ${c.id}: ${s}`;
  if (!c.id) FAIL("a concept has no id");
  if (ids.has(c.id)) FAIL(at("duplicate concept id"));
  ids.add(c.id);
  if (!c.statement) FAIL(at("no statement"));

  // --- option set ---
  const opts = c.options || {};
  const letters = Object.keys(opts);
  if (letters.length !== 3) FAIL(at(`${letters.length} options, must be exactly 3`));
  const lens = letters.map((k) => opts[k].length);
  const max = Math.max(...lens), min = Math.min(...lens);
  if (min > 0 && max / min > RATIO_MAX)
    FAIL(at(`option length ratio ${(max / min).toFixed(2)} exceeds ${RATIO_MAX}`));

  // --- cards ---
  const cardIds = new Set();
  for (const k of c.cards || []) {
    if (cardIds.has(k.id)) FAIL(at(`duplicate card id ${k.id}`));
    cardIds.add(k.id);
    if (!k.title) FAIL(at(`card ${k.id} has no title`));
    if (!Array.isArray(k.body) || !k.body.length) { FAIL(at(`card ${k.id} has no body`)); continue; }
    const words = k.body.join(" ").replace(/<[^>]+>/g, "").trim().split(/\s+/).length;
    if (words < CARD_MIN || words > CARD_MAX)
      FAIL(at(`card ${k.id} is ${words} words, target ${CARD_MIN}-${CARD_MAX}`));
    if (k.body.length < 2) WARN(at(`card ${k.id} is a single paragraph; the clamped view will have nothing to expand`));
  }
  if (!cardIds.size) FAIL(at("no cards"));

  // --- misconceptions ---
  const mis = c.misconceptions || {};
  for (const [slug, m] of Object.entries(mis)) {
    if (!m.statement) FAIL(at(`misconception ${slug} has no statement`));
    if (!cardIds.has(m.corrected_by))
      FAIL(at(`misconception ${slug} corrected_by "${m.corrected_by}" is not a card in this concept`));
  }
  const usedSlugs = new Set();

  // --- pool ---
  const pool = c.pool || [];
  const drawable = pool.filter((p) => !p.reserved).length;
  const reserved = pool.filter((p) => p.reserved).length;
  if (reserved < 1) FAIL(at("no reserved instance; the wrap-up has nothing unseen to draw"));
  if (drawable < 3) FAIL(at(`${drawable} drawable items; need 3 (one check plus two re-asks)`));

  const itemIds = new Set();
  for (const it of pool) {
    if (itemIds.has(it.id)) FAIL(at(`duplicate item id ${it.id}`));
    itemIds.add(it.id);
    if (!it.stem) { FAIL(at(`item ${it.id} has no stem`)); continue; }
    if (DEIXIS.test(it.stem))
      FAIL(at(`item ${it.id} stem has an unbound reference; it must stand alone with the cards removed`));

    if (it.type === "numeric") {
      // Learned is decided solely by the wrap-up, which draws only reserved
      // instances. A numeric there gates a whole concept on recalling a value,
      // unseen, with no re-ask available. Keep numerics in the drawable pool.
      if (it.reserved)
        FAIL(at(`item ${it.id} is numeric and reserved; the reserved instance must be an mcq`));
      if (typeof it.answer !== "number") FAIL(at(`item ${it.id} numeric answer is not a number`));
      if (!it.tolerance) FAIL(at(`item ${it.id} numeric has zero tolerance`));
      if (!it.feedback) FAIL(at(`item ${it.id} has no feedback`));
      const prose = (c.cards || []).map((k) => k.body.join(" ")).join(" ");
      if (!prose.includes(String(it.answer)))
        FAIL(at(`item ${it.id} answer ${it.answer} appears in no card of this concept`));
      continue;
    }

    mcqCount++;
    if (!letters.includes(it.key)) { FAIL(at(`item ${it.id} key "${it.key}" is not in the option set`)); continue; }
    if (opts[it.key].length === max) keyLongest++;
    for (const letter of letters) {
      if (!it.feedback || !it.feedback[letter])
        FAIL(at(`item ${it.id} option ${letter} has no feedback`));
      if (letter === it.key) continue;
      const slug = (it.map || {})[letter];
      if (!slug) { FAIL(at(`item ${it.id} distractor ${letter} names no misconception`)); continue; }
      if (!mis[slug]) FAIL(at(`item ${it.id} names misconception "${slug}", absent from this concept`));
      usedSlugs.add(slug);
    }
  }
  for (const slug of Object.keys(mis))
    if (!usedSlugs.has(slug)) FAIL(at(`misconception ${slug} is never used by an option`));
}

// Key-longest is a LESSON-WIDE rate, never per item. Inside a shared option
// set exactly one option is the longest, and it is necessarily the key of one
// item. A per-item rule would contradict the pairing rule, which wins.
if (mcqCount) {
  const rate = keyLongest / mcqCount;
  const line = `key is the longest option in ${keyLongest}/${mcqCount} items (${Math.round(rate * 100)}%)`;
  if (rate > KEY_LONGEST_MAX) FAIL(line + ` — above ${Math.round(KEY_LONGEST_MAX * 100)}%, so length signals the answer`);
  else console.log("ok    " + line);
}

console.log(`\n${fails} FAIL, ${warns} WARN`);
process.exit(fails ? 1 : 0);

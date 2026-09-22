// The plugin's texts: SKILL.md, the authoring rules, the schema reference, the README and
// the manifests. They are the quiz plugin's texts (docs/reference/quiz-plugin-0.2.0) adapted
// for lesson/v1 and rendered from the shared sources, so the plugin cannot disagree with the
// server: every number comes from the resolver's constants, every field from the JSON Schema
// and every diagnostic from the catalog. `deno task plugin:generate` writes them.
import { CARD_WORDS_MAX, CARD_WORDS_MIN, DRAWABLE_MIN, KEY_LONGEST_MAX, lessonSchema, MAX_DOCUMENT_BYTES, OPTION_COUNT, OPTION_RATIO_MAX } from "../../shared/authoring/resolver.js";
import { DIAGNOSTICS } from "../../shared/authoring/diagnostics.js";
import { capabilitiesFor } from "../api-docs/capabilities.ts";
import { ARCHIVE_FILE, MARKETPLACE_NAME, PLUGIN_NAME, PLUGIN_VERSION, PUBLIC_ORIGIN, pluginLinks, REPOSITORY_DIR, SKILL_NAME } from "./links.ts";

export { ARCHIVE_FILE, MARKETPLACE_NAME, PLUGIN_NAME, PLUGIN_PATH, PLUGIN_VERSION, pluginLinks, REPOSITORY_DIR, SKILL_NAME } from "./links.ts";

const ONE_THIRD = KEY_LONGEST_MAX === 1 / 3 ? "one third" : `${Math.round(KEY_LONGEST_MAX * 100)}%`;

export function pluginManifest() {
  return {
    name: PLUGIN_NAME,
    version: PLUGIN_VERSION,
    description: "Turn the work an agent just did into a retrieval-practice lesson on learn.joshhale.me: author lesson.json, attack the draft, validate it with the site's own validator and create a private draft with a bearer token.",
    author: { name: "Josh Hale" },
    homepage: pluginLinks(PUBLIC_ORIGIN).page,
    repository: pluginLinks(PUBLIC_ORIGIN).repository,
    license: "UNLICENSED",
    keywords: ["learning", "retrieval-practice", "lesson", "learn.joshhale.me"],
  };
}

export function marketplaceManifest(origin: string, archiveSha256: string) {
  const links = pluginLinks(origin);
  return {
    name: MARKETPLACE_NAME,
    description: "Plugins served by learn.joshhale.me. This marketplace lists only the lesson plugin, generated from the site's own authoring contract.",
    owner: { name: "Josh Hale" },
    plugins: [
      {
        name: PLUGIN_NAME,
        description: pluginManifest().description,
        version: PLUGIN_VERSION,
        author: { name: "Josh Hale" },
        homepage: links.page,
        category: "learning",
        source: { source: "archive", url: links.archive, sha256: archiveSha256 },
      },
    ],
  };
}

function skillDescription(): string {
  return "Turn work just done in this session (a diff, a document, a repository, a conversation) into a retrieval-practice lesson on learn.joshhale.me. Use when the user asks to make a lesson, to be quizzed later on what was built, to save what they learned to their phone, or for a comprehension check they can take away. Authors lesson.json, validates it and creates a private draft with LEARN_TOKEN.";
}

export function skillMarkdown(origin: string): string {
  const links = capabilitiesFor(origin).links;
  return `---
name: ${SKILL_NAME}
description: ${skillDescription()}
---

# Lesson

Author a lesson as data. Never author the interface.

The flow, the pedagogy and the layout live in the learn.joshhale.me app, which
Josh opens on his phone. Write only \`lesson.json\`, validate it with the site's
own validator, and create a private draft through the API. The rules the app
owns cannot be forgotten, because there is no code path in which to forget them.

Paths below are relative to this skill's directory, the folder holding this
\`SKILL.md\`. Inside the installed plugin that is
\`\${CLAUDE_PLUGIN_ROOT}/skills/${SKILL_NAME}\`. The scripts run under Node 20+ or Deno.

## Steps

### 1. Establish the source

A lesson needs material that can correct a wrong answer. Identify it before
writing anything:

- Code, a diff, a document, a repository, a conversation.
- If the user is asking about work an agent just did for them, the source is
  that work plus the reasoning behind it.
- If a learning history exists (past wrong answers, a learning record, notes on
  what confused them), read it. Misconceptions the learner actually held make
  far better distractors than invented ones.

Read the source fully. Never author from a summary. Record each source as an
entry in \`sources\` with a \`type\`, a \`title\` and a \`locator\` (a path, URL or
commit SHA), so the lesson can be traced back.

### 2. Read the authoring rules

Read \`references/authoring.md\` and \`references/lesson-schema.md\` before
writing. Keep \`references/diagnostics.md\` at hand for step 4.

The shared-option-set construction in \`authoring.md\` is not a style note. It is
what stops the lesson being solvable by picking the longest answer, and it is
the single most important thing on that page.

### 3. Write lesson.json

Three to five Concepts. Per Concept: one shared set of exactly ${OPTION_COUNT} options,
the misconceptions those options encode, two to four Cards of ${CARD_WORDS_MIN} to
${CARD_WORDS_MAX} words each, and a Pool of at least ${DRAWABLE_MIN} drawable Questions plus one
marked \`"reserved": true\`. Questions live at the top level and name their
Concept and its Pool. Every Concept, Pool, Card and Question ID is a fresh
UUIDv4; generate them once (\`crypto.randomUUID()\`, \`uuidgen\`) and keep them.

Fill \`provenance\` with \`"status": "provided"\` and all five fields: \`client\`
(the agent product, such as Claude Code), \`harness\` (the runtime it ran in,
such as Claude Code CLI or Cowork), \`model\` (the model identifier), \`client_version\`
(the output of \`claude --version\` when available) and \`session_reference\` (the
session ID when the harness exposes one). Write \`"unknown"\` for any field the
harness does not expose. Never omit provenance and never write the token into it.

Write the file to a working directory, not into the user's project, unless
they ask for the file.

### 3b. Attack your own draft

Do this as a separate pass, after the whole lesson exists and before you
validate. Re-read \`references/authoring.md\`, then go Question by Question and
try to break each one. Judgment defects survive a one-shot draft because the
same reasoning that produced a Question also justifies it; they only surface
when you come back to the finished thing and argue against it.

For every Question, answer out loud:

- **Could a learner who never read the Cards answer this?** If the stem already
  contains the substance of the key, names its parts, restates it in other
  words, or describes exactly the situation the key names, the Question is a
  matching exercise. Rewrite the stem to describe a *situation* and leave the
  *judgment* to the options. Beware synonyms: rewording the giveaway is not
  removing it. The test is whether the stem plus general reading comprehension
  is enough.
- **Does each distractor name a misconception the Cards actually correct?** Or
  did you attach the nearest available ID to fill the \`map\`?
- **Does the key move across the Concept's Questions?** Three Questions keying
  the same option is one question asked three times.
- **For numeric Questions: which of the two permitted kinds is this?** If you
  cannot name it as derived-from-mechanism or load-bearing-constant, it is
  incidental. Replace it.
- **For short-answer Questions: is there one canonical answer?** List every
  spelling a correct learner might type in \`aliases\`. If two different
  answers are both right, it is an MCQ.
- **Read every stem cold, out of order.** Does it still stand alone?

Fix what you find, then validate. Report what this pass caught. An adversarial
pass that found nothing is a pass you did not really run.

### 4. Validate

\`\`\`bash
node scripts/validate.mjs lesson.json
\`\`\`

Or, without Node: \`deno run --allow-read scripts/validate.mjs lesson.json\`.

The script runs the site's own resolver, bundled here as
\`scripts/lesson-validator.js\` and also served at ${links.validator}.
Its result is byte-identical to \`POST ${links.resolver}\`;
\`--remote\` proves it against the live API. Every \`FAIL\` line names a diagnostic
code, its JSON Pointer path and the fix from \`references/diagnostics.md\`.

Fix every FAIL and re-run until clean. Do not rationalise a failure, and do not
report the lesson as ready while one stands. Warnings do not block a draft, but
fix them too unless you can say why not.

Expect failures on the first pass. Card word count is the usual one: a model
cannot count its own output while producing it, so any rule expressed as a
number is only evaluable after the fact. That is what this step is for.

### 5. Submit

The bearer token is the \`LEARN_TOKEN\` environment variable. If it is not set,
stop and tell the user to export it in the shell that runs the agent. Never ask
the user to paste the token into the chat, never print it, never write it into
the lesson, a log or a file, and never pass it on a command line.

\`\`\`bash
node scripts/submit.mjs lesson.json
\`\`\`

Or: \`deno run --allow-read --allow-net --allow-env=LEARN_TOKEN,LEARN_BASE_URL scripts/submit.mjs lesson.json\`.

The script resolves the document again, then \`POST\`s it to
${links.lessons} and prints the created draft: its
\`lessonId\`, \`revisionId\`, fingerprint and the learning URL
\`${origin}/learn/<lessonId>\`. Submitting the same document twice returns the
same revision, so a retry is safe. To add a revision to an existing lesson
instead of creating a new one, pass \`--lesson <lessonId>\`.

A \`401\` means the token is missing, invalid, expired or revoked. A \`403\` means
it lacks the \`lessons:write\` scope. A \`422\` means the server's resolver
rejected the document; the printed diagnostics say why. Never work around any
of them.

### 6. Report

Tell the user what the lesson covers, give the learning URL, and say briefly
what the adversarial pass and the validator each caught and what you changed.
Name anything you could not verify.

Never report a pass rate, a score, or a difficulty rating. The app does not
compute them and neither should the summary.

## Rules that are not yours to relax

These live in the site's resolver and in the app. If a user asks for one of them
to change, say it lives in learn.joshhale.me rather than quietly working around
it:

- Exactly ${OPTION_COUNT} options, shared across a Concept, with the longest at most
  ${OPTION_RATIO_MAX} times the length of the shortest.
- Every distractor names a misconception corrected by a Card in the same Concept.
- Feedback on every option, including the key, delivered immediately.
- "I don't know" on every Question, no penalty and no reward.
- A wrong answer is re-asked from an unseen Question of the same Pool.
- Learned is earned only in the Wrap-up. Drill mode serves every Question,
  reserved ones included, but never earns it.
- A numeric Question is never reserved and its answer appears in a Card.
- No score, no streak, no difficulty, no time estimate, no partial credit, and
  never the word mastery. Say Retained, not Mastered.

## Discovery

The site describes itself at ${links.self}. That
document links the JSON Schema (${links.schema}), the
OpenAPI document (${links.openapi}), the diagnostics
catalog (${links.diagnostics}) and the human
documentation (${links.docs}). The texts in this plugin
are generated from the same sources, so they agree with the server; when in
doubt, the served documents win.
`;
}

export function authoringMarkdown(origin: string): string {
  const links = capabilitiesFor(origin).links;
  return `# Authoring rules

The validator enforces everything countable. This file covers what it cannot:
the judgment that decides whether the lesson teaches or just tests recognition.
The countable rules are listed at the end with their diagnostic codes.

## The shared option set is the whole technique

Write **one set of ${OPTION_COUNT} options per Concept**, and reuse it for every MCQ in
that Concept. Each Question asks about a different member of the set, so the key
moves and the options do not.

\`\`\`
Options, Concept "yield-vs-block":
  block   It blocks the worker thread. No other task on that worker can run.
  yield   It yields the task. The worker is free to run another task.
  own     Each task gets its own worker, so both make progress at the same time.

Question a: "std::thread::sleep on a single-worker runtime does what?"       key block
Question b: "tokio::time::sleep(d).await on a single-worker runtime?"        key yield
Question c: "std::thread::sleep with worker_threads = 2?"                    key own
\`\`\`

In \`lesson/v1\` the set is the Concept's \`options\` array: ${OPTION_COUNT} entries of
\`{ "id", "text" }\`. An MCQ's \`key\` names one option ID, its \`map\` names the
other ${OPTION_COUNT - 1}, and its \`feedback\` has an entry for all ${OPTION_COUNT}.

This is from Little et al. via the ai-microlearning research, and it does four
jobs at once:

1. **Length cannot signal the key.** The options are identical strings across
   Questions, so "pick the longest" carries no information. Writing the key
   first in full precision and the distractors afterwards as brief wrong things
   is the natural failure mode, and this construction makes it unavailable.
   The resolver also refuses a set whose longest option is more than
   ${OPTION_RATIO_MAX} times the shortest, and a lesson in which the key is the longest
   option in more than ${ONE_THIRD} of its MCQs.
2. **Every distractor is true of something.** It is a sibling Question's key,
   so it is a real, precisely stated claim rather than a strawman.
3. **Coverage falls out.** Three Questions over one set force the term, the
   rule and the boundary rather than three paraphrases of one idea.
4. **It compresses.** The set is written once.

Build the set from claims that are **mutually exclusive and all plausible**. If
two options could both be true of the same stem, the Question has no single
answer.

## Distractor provenance

> Every distractor must be a misconception the source material explicitly
> corrects, warns against, or clarifies. Point to the passage that corrects it.
> If you cannot find such a passage, do not invent a distractor. Write a
> different question.

The schema enforces the structural half of this: misconceptions live inside
the Concept as \`{ "id", "statement", "correctingCardId" }\`, so a distractor can
only ever be corrected by a Card in the same Concept. A learner is never told
they hold a belief that the material has not yet addressed. Every misconception
must be named by the \`map\` of some MCQ in its Concept; an unused one is an
error.

What it cannot enforce is whether the misconception is *real*. Prefer, in order:

1. A misconception recorded in the learner's own history: a learning record, a
   past wrong answer, a question they asked.
2. One the source material stops to correct, which is evidence somebody hit it.
3. A confusion between two adjacent things in the source.

Never invent a belief nobody holds just to fill the third slot.

## Stems stand alone

Strip every Card away and the stem must still make sense. That means no
"the second reason", "the above", "this approach", "besides the one already
mentioned". Name the subject inside the stem.

The resolver catches common phrasings (\`question.stem.unbound\`), but it cannot
catch a stem that depends on the Question before it. Read each stem cold, out
of order, before you submit.

## Feedback

Every option gets feedback, including the key. Correct answers are the cheapest
place to add a sentence of consolidation.

Wrong-answer feedback names the error without asserting the learner's mind. The
app already prints "The belief behind that option", so write the misconception
\`statement\` as the belief itself, in plain words. A selected option can also be
a slip, so do not write feedback that scolds.

Numeric and short Questions carry one \`feedback\` string shown after any
answer, and a \`correctingCardId\` naming the Card shown after a wrong answer or
"I don't know". Every Question has a \`correctingCardId\`; for an MCQ it is the
Card shown after "I don't know".

## Cards

Target **${CARD_WORDS_MIN} to ${CARD_WORDS_MAX} words**, two to four paragraphs. The spec everyone writes
is "30 to 60 seconds", which is not a unit anything can emit. Convert it once,
here, and write to the word count. The count is taken after inline HTML tags
such as \`<code>\` and \`<em>\` are stripped.

A Card is \`{ "id", "heading", "body" }\` where \`body\` is an array of paragraph
strings. Write at least two paragraphs: after a wrong answer the app shows the
correcting Card clamped to its first paragraph, so a single-paragraph Card has
nothing to expand (\`card.paragraphs.single\`).

Structure that reliably lands in range:

1. The claim, stated as a conclusion. Not background, not a definition.
2. The mechanism. Why it is true.
3. A concrete instance with real numbers, names, or output.
4. The consequence, or what it rules out.

The first Card of each Concept leads with the most interesting claim in it. A
Concept has at least two Cards.

Vary sentence length deliberately. Three sentences of similar length in a row
is the single clearest tell of generated prose. Do not pad to create contrast;
combine or cut instead.

## Numeric Questions

The test is not whether the number appears in a Card. It is whether a learner
who understood the Concept can produce it. Two kinds qualify.

**Derived from the mechanism.** The number falls out of the idea being taught,
and getting it right is evidence of understanding rather than of memory. Six
blocking sleeps of 300ms on one worker print at about 1800ms; you can only
answer that if you know blocking serialises. Prefer this kind. The arithmetic
must be one step and doable in the head; a figure requiring several chained
operations tests arithmetic on top of the concept and punishes a slip as if it
were a misconception.

**A load-bearing constant.** The number's *magnitude* is the claim the Card
makes. "Spaced retrieval gained about 2 percentage points across nine courses"
is a finding whose whole point is that the value is small, so recalling it
approximately is recalling the argument. Ask about the magnitude, and set the
tolerance so that anyone who took the point scores, not so that only someone
who memorised the decimal does.

**Never an incidental constant.** A number that merely identifies a finding,
where nothing about understanding the Concept lets you reconstruct it, is
vocabulary wearing a number's clothes. \`g+ = 0.53\` for the signaling effect is
the type case: the learner either memorised two digits or did not, and no
amount of understanding closes the gap. If the answer could be swapped for a
different plausible value without changing any argument in the Cards, it is
incidental; write an MCQ instead.

The resolver requires the answer, written as a number, to appear in a Card of
the Concept (\`numeric.answer.uncovered\`). That is the countable half of the
rule above, not a substitute for it.

A numeric Question is never the reserved instance (\`numeric.reserved\`).
Reserved Questions are what the Wrap-up draws, and the Wrap-up alone decides
Learned, so a Concept must never hang on a number the learner has not seen
asked before. Numeric Questions belong in the drawable Pool, where a wrong
answer still earns a re-ask.

Always set a \`tolerance\`, and set it from the claim rather than from the
decimal. If the point is "small, a couple of points", 1 is right and 0.5 is not.
Zero is not accepted (\`numeric.tolerance.missing\`): even an exact integer the
source states verbatim deserves a small tolerance, because typing is not
understanding. An optional \`unit\` is shown beside the input.

## Short-answer Questions

\`lesson/v1\` adds a third type. A short Question asks the learner to type a
term, a header name, a command or an identifier, and matches the typed text
against \`answer\` and every string in \`aliases\`, ignoring case and surrounding
whitespace. Nothing else is normalised, so list the spellings yourself:
\`"Age"\` with aliases \`["age header", "the age header"]\`.

Use a short Question when there is exactly one right answer and recalling it
cold is the skill. Do not use one for a judgment or a definition; that is an
MCQ, where the shared option set does the work. A short Question may be
reserved, and it counts toward the ${DRAWABLE_MIN} drawable Questions when it is not.

## Pools

Each Concept owns one Pool, named by its \`poolId\`. Every Question of the
Concept carries that \`poolId\`. A Concept Check draws from the drawable
Questions and re-asks from an unseen one after a wrong answer, so a Pool needs
at least ${DRAWABLE_MIN} drawable Questions (\`pool.drawable.minimum\`). The Wrap-up draws
reserved Questions first, so a Pool needs at least one \`"reserved": true\`
Question (\`pool.reserved.missing\`). Three total is the number people reach for,
and it leaves the Wrap-up re-serving a Question the learner has already been
shown the answer to.

## Concepts

One Concept is one thing the learner can do, stated as a capability in the
optional \`statement\`:

> Say what each kind of sleep does to the worker, and predict the ordering of
> two tasks on one worker.

Not a topic ("sleeps"). Not a list of three capabilities. If the statement needs
an "and" joining unrelated verbs, it is two Concepts.

Three to five Concepts is a normal lesson. More than six is a course.

## What never appears

No score, no percentage, no grade, no streak, no difficulty label, no time
estimate, no partial credit, and never the word mastery. The app does not
implement any of them, which is the point. The only learner-facing outcomes are
Seen, Learned and Retained.

## The countable rules

${countableRules()}

The full catalog with every code's path and fix is \`references/diagnostics.md\`,
served as JSON at ${links.diagnostics}.
`;
}

function countableRules(): string {
  const picked = [
    "concept.options.count",
    "concept.options.ratio",
    "lesson.key.longest",
    "concept.cards.minimum",
    "card.words",
    "card.paragraphs.single",
    "misconception.card",
    "misconception.unused",
    "mcq.map.missing",
    "mcq.feedback.missing",
    "question.stem.unbound",
    "numeric.answer.uncovered",
    "numeric.tolerance.missing",
    "numeric.reserved",
    "pool.drawable.minimum",
    "pool.reserved.missing",
    "provenance.required",
    "document.size",
  ];
  const rows = picked.map((code) => {
    const entry = DIAGNOSTICS.find((item) => item.code === code);
    if (!entry) throw new Error(`authoring.md names ${code}, which is not in the diagnostics catalog`);
    return `| \`${entry.code}\` | ${entry.severity} | ${entry.meaning.replaceAll("|", "\\|")} |`;
  });
  return ["| Code | Severity | Rule |", "| --- | --- | --- |", ...rows].join("\n");
}

type Schema = Record<string, any>;

function refName(ref: string): string {
  return ref.slice(ref.lastIndexOf("/") + 1);
}

/** A short type description for one property schema. */
function describeType(schema: Schema): string {
  if (schema.$ref) return `[${refName(schema.$ref)}](#${refName(schema.$ref).toLowerCase()})`;
  if (schema.const !== undefined) return `\`${JSON.stringify(schema.const)}\``;
  if (schema.enum) return schema.enum.map((value: unknown) => `\`${JSON.stringify(value)}\``).join(" or ");
  if (schema.type === "array") {
    const items = schema.items ? describeType(schema.items) : "any";
    const bounds = [schema.minItems !== undefined ? `min ${schema.minItems}` : "", schema.maxItems !== undefined ? `max ${schema.maxItems}` : ""].filter(Boolean).join(", ");
    return `array of ${items}${bounds ? ` (${bounds})` : ""}`;
  }
  if (schema.type === "object") {
    const values = schema.additionalProperties && typeof schema.additionalProperties === "object" ? describeType(schema.additionalProperties) : "any";
    const bounds = [schema.minProperties !== undefined ? `min ${schema.minProperties}` : "", schema.maxProperties !== undefined ? `max ${schema.maxProperties}` : ""].filter(Boolean).join(", ");
    return `object of ${values}${bounds ? ` (${bounds} entries)` : ""}`;
  }
  if (Array.isArray(schema.type)) return schema.type.join(" or ");
  const constraints = [schema.exclusiveMinimum !== undefined ? `> ${schema.exclusiveMinimum}` : "", schema.minLength ? "non-empty" : "", schema.pattern && schema.pattern !== "\\S" ? `pattern \`${schema.pattern}\`` : ""].filter(Boolean).join(", ");
  return `${schema.type ?? "any"}${constraints ? ` (${constraints})` : ""}`;
}

function propertyRows(schema: Schema, required: string[]): string {
  const rows = Object.entries(schema.properties ?? {}).map(([name, property]) => {
    const value = property as Schema;
    const description = (value.description ?? "").replaceAll("|", "\\|");
    return `| \`${name}\` | ${required.includes(name) ? "yes" : "no"} | ${describeType(value)} | ${description} |`;
  });
  return ["| Field | Required | Type | Meaning |", "| --- | --- | --- | --- |", ...rows].join("\n");
}

function definitionSection(name: string, definition: Schema): string {
  const lines = [`### ${name}`, ""];
  if (definition.description) lines.push(definition.description, "");
  if (definition.properties) {
    lines.push(propertyRows(definition, definition.required ?? []), "");
    if (definition.additionalProperties === false || definition.unevaluatedProperties === false) lines.push("Unknown fields are rejected by the schema as likely typos.", "");
  } else if (definition.oneOf && definition.oneOf.every((branch: Schema) => branch.properties)) {
    lines.push("One of:", "");
    definition.oneOf.forEach((branch: Schema, index: number) => {
      lines.push(`**Form ${index + 1}**`, "", propertyRows(branch, branch.required ?? []), "");
    });
  } else if (definition.oneOf) {
    const all = (definition.allOf ?? []).map((item: Schema) => describeType(item)).join(", ");
    const one = definition.oneOf.map((item: Schema) => describeType(item)).join(", ");
    if (all) lines.push(`Every Question has the fields of ${all}.`, "");
    lines.push(`The \`type\` selects exactly one variant: ${one}. A field that belongs to no variant is rejected.`, "");
  } else {
    lines.push(`Type: ${describeType(definition)}.`, "");
    if (definition.not?.enum) lines.push(`Never one of ${definition.not.enum.map((value: string) => `\`${value}\``).join(", ")}.`, "");
    if (definition.not?.pattern) lines.push(`Rejected when it matches \`${definition.not.pattern}\`.`, "");
  }
  return lines.join("\n");
}

/** The example document in the schema reference, small enough to read and shaped exactly like a valid lesson. */
export function exampleLesson() {
  return {
    schema: "lesson/v1",
    title: "Blocking a thread vs. yielding a task",
    assumedKnowledge: "You have run both versions and seen the output.",
    concepts: [
      {
        id: "c0a8e6f2-1b7d-4c3e-9f21-6a5b4d3c2e10",
        title: "Sleeping on one worker",
        statement: "Say what each kind of sleep does to the worker, and predict the ordering of two tasks on one worker.",
        poolId: "d1b9f7a3-2c8e-4d4f-8a32-7b6c5e4d3f21",
        options: [
          { id: "block", text: "It blocks the worker thread. No other task on that worker can run." },
          { id: "yield", text: "It yields the task. The worker is free to run another task." },
          { id: "own", text: "Each task gets its own worker, so both make progress at the same time." },
        ],
        misconceptions: [
          { id: "block_yields", statement: "std::thread::sleep lets other tasks run while it waits.", correctingCardId: "e2c0a8b4-3d9f-4e5a-9b43-8c7d6f5e4a32" },
          { id: "await_blocks", statement: "Awaiting a sleep parks the whole worker thread.", correctingCardId: "f3d1b9c5-4e0a-4f6b-8c54-9d8e7a6f5b43" },
        ],
        cards: [
          { id: "e2c0a8b4-3d9f-4e5a-9b43-8c7d6f5e4a32", heading: "A blocking sleep costs you the whole worker", body: ["First paragraph. The claim, then the mechanism.", `Second paragraph. A concrete instance: six blocking sleeps of 300ms on one worker print at about 1800ms. Then the consequence. ${CARD_WORDS_MIN} to ${CARD_WORDS_MAX} words across the whole Card.`] },
          { id: "f3d1b9c5-4e0a-4f6b-8c54-9d8e7a6f5b43", heading: "An awaited sleep hands the worker back", body: ["First paragraph.", "Second paragraph."] },
        ],
      },
    ],
    questions: [
      {
        id: "a4e2c0d6-5f1b-4a7c-9d65-0e9f8b7a6c54",
        conceptId: "c0a8e6f2-1b7d-4c3e-9f21-6a5b4d3c2e10",
        poolId: "d1b9f7a3-2c8e-4d4f-8a32-7b6c5e4d3f21",
        type: "mcq",
        reserved: false,
        stem: "On a single-worker runtime, one of two spawned tasks calls std::thread::sleep(300ms). What does that call do?",
        correctingCardId: "e2c0a8b4-3d9f-4e5a-9b43-8c7d6f5e4a32",
        key: "block",
        map: { yield: "block_yields", own: "await_blocks" },
        feedback: { block: "Right. The kernel parks the thread.", yield: "That is the awaited version.", own: "There is only one worker here." },
      },
      {
        id: "b5f3d1e7-6a2c-4b8d-8e76-1f0a9c8b7d65",
        conceptId: "c0a8e6f2-1b7d-4c3e-9f21-6a5b4d3c2e10",
        poolId: "d1b9f7a3-2c8e-4d4f-8a32-7b6c5e4d3f21",
        type: "numeric",
        reserved: false,
        stem: "Two tasks, three ticks each, 300ms blocking sleep per tick, one worker. Roughly what does main done print, in ms?",
        correctingCardId: "e2c0a8b4-3d9f-4e5a-9b43-8c7d6f5e4a32",
        answer: 1800,
        tolerance: 150,
        unit: "ms",
        feedback: "About 1800. Six blocking sleeps run back to back.",
      },
      {
        id: "c6a4e2f8-7b3d-4c9e-9f87-2a1b0d9c8e76",
        conceptId: "c0a8e6f2-1b7d-4c3e-9f21-6a5b4d3c2e10",
        poolId: "d1b9f7a3-2c8e-4d4f-8a32-7b6c5e4d3f21",
        type: "short",
        reserved: false,
        stem: "Which tokio function sleeps without holding the worker?",
        correctingCardId: "f3d1b9c5-4e0a-4f6b-8c54-9d8e7a6f5b43",
        answer: "tokio::time::sleep",
        aliases: ["time::sleep", "tokio sleep"],
        feedback: "tokio::time::sleep. It returns a future; awaiting it yields the task.",
      },
      {
        id: "d7b5f3a9-8c4e-4d0f-8a98-3b2c1e0d9f87",
        conceptId: "c0a8e6f2-1b7d-4c3e-9f21-6a5b4d3c2e10",
        poolId: "d1b9f7a3-2c8e-4d4f-8a32-7b6c5e4d3f21",
        type: "mcq",
        reserved: true,
        stem: "A task calls tokio::time::sleep(d).await on a single-worker runtime. What happens to the worker?",
        correctingCardId: "f3d1b9c5-4e0a-4f6b-8c54-9d8e7a6f5b43",
        key: "yield",
        map: { block: "await_blocks", own: "block_yields" },
        feedback: { block: "Awaiting hands the worker back.", yield: "Right. The runtime polls another task.", own: "One worker, shared." },
      },
    ],
    sources: [{ type: "repository", title: "sleep-demo", locator: "https://example.com/sleep-demo/commit/abc123", capturedText: null }],
    provenance: { status: "provided", client: "Claude Code", harness: "Claude Code CLI", model: "claude-fable-5-1", client_version: "unknown", session_reference: "unknown" },
  };
}

export function lessonSchemaMarkdown(origin: string): string {
  const links = capabilitiesFor(origin).links;
  const schema = lessonSchema as Schema;
  const definitions = Object.entries(schema.$defs as Record<string, Schema>).map(([name, definition]) => definitionSection(name, definition));
  return `# lesson.json reference (lesson/v1)

One file. The site validates and stores it; nothing else is authored. This
reference is rendered from the JSON Schema served at ${links.schema},
so the field names and counts below are the server's own.

${schema.description}

## Shape

\`\`\`json
${JSON.stringify(exampleLesson(), null, 2)}
\`\`\`

The example has one Concept so it fits on a page. A real lesson has three to
five, and every Card body runs ${CARD_WORDS_MIN} to ${CARD_WORDS_MAX} words. Concept, Pool, Card and
Question IDs are UUIDv4 generated once; option and misconception IDs are short
slugs local to their Concept.

## Top level

${propertyRows(schema, schema.required)}

Unknown top-level fields are rejected by the schema as likely typos. The
document may be at most ${MAX_DOCUMENT_BYTES.toLocaleString("en-US")} bytes.

## Definitions

${definitions.join("\n")}
## Pool sizing

\`"reserved": true\` marks the Question the Concept Check never draws. It exists
so the Wrap-up always has something unseen. Each Pool needs at least
${DRAWABLE_MIN} drawable Questions plus one reserved, because a Concept where the learner
misses twice consumes one Question per attempt. A numeric Question is never
reserved.

## What the app does with this

Fixed, and not re-derivable by the authoring agent:

- Cards one at a time, one Check at the end of each Concept.
- "I don't know" on every Question, no penalty and no reward.
- Feedback immediately, on every answer, never batched.
- A wrong MCQ answer names the belief behind the chosen option, then shows the
  correcting Card clamped to its first paragraph. A wrong numeric or short
  answer shows the Question's correcting Card.
- Re-ask drawn from an unseen Question in the same Pool.
- "I don't know" routes to the correcting Card and moves on without probing
  that Concept again this sitting.
- A Wrap-up over every Concept, drawing reserved Questions first.
- A drill mode that serves every Question, reserved included, with feedback
  and correcting Cards, and never awards Learned.
- **Learned is decided solely by the Wrap-up.** Getting a Check right does
  not earn it. Progress never moves backward.
- Options shuffled per render. No score, no difficulty, no time estimate.
`;
}

export function readmeMarkdown(origin: string): string {
  const links = pluginLinks(origin);
  return `# ${PLUGIN_NAME}

Turn the work an agent just did into a retrieval-practice lesson that Josh
opens on his phone at learn.joshhale.me.

Ask for a lesson on something: code an agent just wrote, a diff, a document, a
repository. The \`${SKILL_NAME}\` skill reads the source, writes \`lesson.json\`, attacks its
own draft, validates it with the site's own validator and creates a private
draft through the API. You get back a URL.

## Install

Three routes, all served by the site. Pick one.

**Claude Code plugin.** Add the site's marketplace, then install:

\`\`\`bash
claude plugin marketplace add ${links.marketplace}
claude plugin install ${PLUGIN_NAME}@${MARKETPLACE_NAME}
\`\`\`

The marketplace names one plugin whose source is the archive below, pinned by
its SHA-256.

**Clone the plugin directory.** The site serves it as a Git repository:

\`\`\`bash
git clone ${links.repository}
claude --plugin-dir ./learn-lesson-plugin
\`\`\`

Or download and unpack the archive: \`${links.archive}\`.
\`claude --plugin-dir\` also accepts the \`.zip\` directly.

**Copy the one skill.** Everything the skill needs is inside
\`skills/${SKILL_NAME}/\`. Copy that directory into \`~/.claude/skills/${SKILL_NAME}\` (or a
project's \`.claude/skills/${SKILL_NAME}\`) and the skill is available without the
plugin. The scripts run under Node 20+ or Deno.

## The token

The skill reads Josh's bearer token from the \`LEARN_TOKEN\` environment variable
of the shell that runs the agent. It never prints the token, never writes it
into a lesson or a log and never passes it on a command line. Mint one with
\`lessons:write\` scope using the site's \`token:mint\` task.

## Why the interface is fixed

The agent writes only the content. Everything about how a lesson behaves lives
in the learn.joshhale.me app and is never regenerated, which means it cannot
drift between one lesson and the next:

- One Check at the end of each Concept, not sprinkled through it.
- "I don't know" on every Question, with no penalty and no reward.
- Feedback immediately, on every answer, never held to the end.
- A wrong answer names the belief behind the option you picked and shows the
  Card that corrects it.
- Then it asks again, using a Question you have not seen.
- A Wrap-up over every Concept, drawing reserved Questions first. Getting a
  Check right does not count as Learned; retrieving it cold in the Wrap-up does.
- No score, no streak, no difficulty rating, no time estimate.

## Why ${OPTION_COUNT} options, always the same ${OPTION_COUNT}

Within a Concept, every MCQ offers the identical ${OPTION_COUNT} options and only the
correct one moves. So the longest answer is not the right answer, a shortcut
most generated quizzes hand you without meaning to, and every wrong option is
some other Question's right one, which makes it genuinely tempting instead of
obviously filler.

## What gets checked before Josh sees it

The site's resolver runs over the content first and refuses anything that
would teach the wrong lesson: options that give the answer away by length, a
correction that references material the learner has not read, Cards too short
to be worth reading, a stem that only makes sense if you remember the previous
one, a numeric answer nobody stated, or too few Questions held back for the
Wrap-up. The plugin bundles the same resolver, so the agent sees every failure
before it submits. Every code is explained in
\`skills/${SKILL_NAME}/references/diagnostics.md\`.

## Generated, not written

Every text in this plugin is generated from the site's own sources by
\`deno task plugin:generate\`: the resolver's constants, the JSON Schema and the
diagnostics catalog. Do not edit the files here; change the sources and
regenerate. Version ${PLUGIN_VERSION}.

## Credits

The question construction follows Little et al. on competitive distractors.
The flow follows the learn.joshhale.me lesson specification. This plugin is
the \`quiz\` plugin (0.2.0) re-pointed at the site.
`;
}

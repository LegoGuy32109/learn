// Ticket 13 audit: derive every contract attack from the audit lesson and write it as a fixture.
// Run: deno run --allow-read --allow-write tests/audit/contract-attacks/generate.ts
// The fixtures and manifest.json are committed; the test reads them and never regenerates.
// The oversized documents are built at test time because a 1,000,001-byte file has no place in Git.

const here = new URL("./", import.meta.url);
const base = JSON.parse(await Deno.readTextFile(new URL("audit-lesson.json", here)));

export interface Attack {
  file: string;
  /** The attack group from the ticket. */
  group: string;
  /** What the resolver must answer. */
  valid: boolean;
  /** Codes that must appear in the diagnostics. */
  codes: string[];
  /** When true, the diagnostics must be exactly these codes. */
  exact: boolean;
  /** The document carries a property outside the contract, which the schema rejects and the resolver drops. */
  unknownProperties?: boolean;
  note: string;
}

const attacks: Attack[] = [];
type Mutation = (lesson: any) => void;

function clone(): any {
  return structuredClone(base);
}

async function fixture(file: string, group: string, expectation: { valid: boolean; codes: string[]; exact?: boolean; unknownProperties?: boolean; note?: string }, mutate: Mutation) {
  const lesson = clone();
  mutate(lesson);
  await Deno.writeTextFile(new URL(`fixtures/${file}.json`, here), JSON.stringify(lesson, null, 2) + "\n");
  attacks.push({
    file: `${file}.json`,
    group,
    valid: expectation.valid,
    codes: expectation.codes,
    exact: expectation.exact ?? true,
    unknownProperties: expectation.unknownProperties,
    note: expectation.note ?? "",
  });
}

/** Two paragraphs totalling exactly `words` words of plain text. */
function bodyOf(words: number): string[] {
  const all = Array.from({ length: words }, (_, index) => `word${index + 1}`);
  const split = Math.floor(words / 2);
  return [all.slice(0, split).join(" "), all.slice(split).join(" ")];
}

const mcqs = (lesson: any) => lesson.questions.filter((question: any) => question.type === "mcq");
const conceptOf = (lesson: any, question: any) => lesson.concepts.find((concept: any) => concept.id === question.conceptId);

// --- The reference plugin's validate.mjs rules, translated to lesson/v1 ---------------------------

await fixture("ref-no-title", "reference-validator", { valid: false, codes: ["title.required"] }, (lesson) => delete lesson.title);
await fixture("ref-no-concepts", "reference-validator", { valid: false, codes: ["concepts.required"], exact: false, note: "Every question then references a missing Concept as well." }, (lesson) => lesson.concepts = []);
await fixture("ref-duplicate-concept-id", "reference-validator", { valid: false, codes: ["concept.id"], exact: false, note: "Questions of the second Concept now resolve to the first, so pool and Card membership also fail." }, (lesson) => lesson.concepts[1].id = lesson.concepts[0].id);
await fixture("ref-no-statement", "reference-validator", { valid: true, codes: [], note: "validate.mjs fails a Concept without a statement; lesson/v1 made statement optional (Josh's decision of 2026-09-21)." }, (lesson) => delete lesson.concepts[0].statement);
await fixture("ref-options-count", "reference-validator", { valid: false, codes: ["concept.options.count"], exact: false, note: "Two options; every MCQ of the Concept then has an extra feedback and map entry." }, (lesson) => lesson.concepts[2].options.pop());
await fixture("ref-option-ratio", "reference-validator", { valid: false, codes: ["concept.options.ratio"] }, (lesson) => lesson.concepts[2].options[0].text = "Drain the outbox first.");
await fixture("ref-duplicate-card-id", "reference-validator", { valid: false, codes: ["card.id"], exact: false, note: "The second Card's ID repeats the first, so the misconceptions and Questions that named it dangle." }, (lesson) => lesson.concepts[2].cards[1].id = lesson.concepts[2].cards[0].id);
await fixture("ref-card-no-heading", "reference-validator", { valid: false, codes: ["card.heading"] }, (lesson) => delete lesson.concepts[2].cards[0].heading);
await fixture("ref-card-no-body", "reference-validator", { valid: false, codes: ["card.body.paragraphs"] }, (lesson) => lesson.concepts[2].cards[0].body = []);
await fixture("ref-card-words", "reference-validator", { valid: false, codes: ["card.words"] }, (lesson) => lesson.concepts[2].cards[0].body = bodyOf(40));
await fixture("ref-card-single-paragraph", "reference-validator", { valid: true, codes: ["card.paragraphs.single"], note: "A warning; the document stays valid." }, (lesson) => lesson.concepts[2].cards[0].body = [lesson.concepts[2].cards[0].body.join(" ")]);
await fixture("ref-no-cards", "reference-validator", { valid: false, codes: ["concept.cards.minimum"], exact: false, note: "Misconceptions and Questions of the Concept lose their correcting Cards too." }, (lesson) => lesson.concepts[2].cards = []);
await fixture("ref-misconception-no-statement", "reference-validator", { valid: false, codes: ["misconception.statement"] }, (lesson) => lesson.concepts[2].misconceptions[0].statement = "");
await fixture("ref-misconception-card-outside", "reference-validator", { valid: false, codes: ["misconception.card"] }, (lesson) => lesson.concepts[2].misconceptions[0].correctingCardId = lesson.concepts[0].cards[0].id);
await fixture("ref-no-reserved", "reference-validator", { valid: false, codes: ["pool.reserved.missing"] }, (lesson) => {
  const reserved = lesson.questions.find((question: any) => question.conceptId === lesson.concepts[2].id && question.reserved);
  reserved.reserved = false;
});
await fixture("ref-drawable-under-3", "reference-validator", { valid: false, codes: ["lesson.key.longest", "pool.drawable.minimum"], note: "Removing one drawable MCQ also lifts the lesson-wide key-longest rate from 3/9 to 3/8, which is above one third." }, (lesson) => {
  const index = lesson.questions.findIndex((question: any) => question.conceptId === lesson.concepts[2].id && !question.reserved);
  lesson.questions.splice(index, 1);
});
await fixture("ref-duplicate-question-id", "reference-validator", { valid: false, codes: ["question.id"] }, (lesson) => lesson.questions[1].id = lesson.questions[0].id);
await fixture("ref-no-stem", "reference-validator", { valid: false, codes: ["question.stem"] }, (lesson) => delete lesson.questions[0].stem);
await fixture("ref-stem-deixis", "reference-validator", { valid: false, codes: ["question.stem.unbound"] }, (lesson) => lesson.questions[0].stem = "Which of the above does the server do when a passkey is removed?");
await fixture("ref-numeric-reserved", "reference-validator", { valid: false, codes: ["numeric.reserved"] }, (lesson) => lesson.questions[2].reserved = true);
await fixture("ref-numeric-answer-not-number", "reference-validator", { valid: false, codes: ["numeric.answer"] }, (lesson) => lesson.questions[2].answer = "thirty");
await fixture("ref-numeric-zero-tolerance", "reference-validator", { valid: false, codes: ["numeric.tolerance.missing"] }, (lesson) => lesson.questions[2].tolerance = 0);
await fixture("ref-numeric-no-feedback", "reference-validator", { valid: false, codes: ["question.feedback"] }, (lesson) => delete lesson.questions[2].feedback);
await fixture("ref-numeric-answer-uncovered", "reference-validator", { valid: false, codes: ["numeric.answer.uncovered"] }, (lesson) => lesson.questions[2].answer = 31);
await fixture("ref-mcq-key-not-in-set", "reference-validator", { valid: false, codes: ["mcq.key"], exact: false, note: "The old key is now a distractor without a map entry." }, (lesson) => lesson.questions[0].key = "nope");
await fixture("ref-mcq-feedback-missing", "reference-validator", { valid: false, codes: ["mcq.feedback.missing"] }, (lesson) => delete lesson.questions[0].feedback.bump);
await fixture("ref-mcq-map-missing", "reference-validator", { valid: false, codes: ["mcq.map.missing"] }, (lesson) => delete lesson.questions[0].map.remint);
await fixture("ref-mcq-map-unknown", "reference-validator", { valid: false, codes: ["mcq.map.unknown"] }, (lesson) => lesson.questions[0].map.remint = "no_such_belief");
await fixture("ref-misconception-unused", "reference-validator", { valid: false, codes: ["misconception.unused"] }, (lesson) => {
  lesson.concepts[2].misconceptions.push({ id: "spare_belief", statement: "Sign-out is instantaneous on every device.", correctingCardId: lesson.concepts[2].cards[0].id });
});
await fixture("ref-key-longest", "reference-validator", { valid: false, codes: ["lesson.key.longest"] }, (lesson) => {
  // Make the key of every MCQ the longest option by lengthening only the keyed option text in each Concept
  // is impossible with one shared set; instead re-key every MCQ of each Concept to that Concept's longest option.
  for (const question of mcqs(lesson)) {
    const concept = conceptOf(lesson, question);
    const longest = concept.options.reduce((best: any, option: any) => (option.text.length > best.text.length ? option : best), concept.options[0]);
    if (question.key === longest.id) continue;
    const oldKey = question.key;
    const [firstDistractor] = Object.keys(question.map);
    // Swap the key with a distractor, carrying that distractor's misconception onto the old key.
    const misconception = question.map[longest.id] ?? question.map[firstDistractor];
    delete question.map[longest.id];
    question.map[oldKey] = misconception;
    question.key = longest.id;
  }
  // Every misconception must still be used; re-map one distractor per Concept where needed.
  for (const concept of lesson.concepts) {
    const used = new Set(mcqs(lesson).filter((q: any) => q.conceptId === concept.id).flatMap((q: any) => Object.values(q.map)));
    for (const misconception of concept.misconceptions) {
      if (used.has(misconception.id)) continue;
      const question = mcqs(lesson).find((q: any) => q.conceptId === concept.id);
      const [distractor] = Object.keys(question.map);
      question.map[distractor] = misconception.id;
      used.add(misconception.id);
    }
  }
});

// --- Ticket attacks ---------------------------------------------------------------------------------

await fixture("key-longest-every-mcq", "key-longest", { valid: false, codes: ["lesson.key.longest"], exact: false, note: "Same construction as ref-key-longest but with the misconception behind the longest option left unused, as a first draft would." }, (lesson) => {
  for (const question of mcqs(lesson)) {
    const concept = conceptOf(lesson, question);
    const longest = concept.options.reduce((best: any, option: any) => (option.text.length > best.text.length ? option : best), concept.options[0]);
    if (question.key === longest.id) continue;
    const oldKey = question.key;
    const misconception = question.map[longest.id];
    delete question.map[longest.id];
    question.map[oldKey] = misconception;
    question.key = longest.id;
  }
});

for (const words of [119, 201]) {
  await fixture(`card-${words}-words`, "card-words", { valid: false, codes: ["card.words"] }, (lesson) => lesson.concepts[2].cards[0].body = bodyOf(words));
}
for (const words of [120, 200]) {
  await fixture(`card-${words}-words`, "card-words", { valid: true, codes: [], note: "Boundary value; the range is inclusive." }, (lesson) => lesson.concepts[2].cards[0].body = bodyOf(words));
}
await fixture("card-119-words-plus-tags", "card-words", { valid: false, codes: ["card.words"], note: "Inline tags add characters but not words." }, (lesson) => {
  const body = bodyOf(119);
  lesson.concepts[2].cards[0].body = body.map((paragraph) => `<code>${paragraph}</code> <em>${paragraph.split(" ")[0]}</em>`.replace(/<em>word\d+<\/em>/, ""));
});

const deixis = ["the second", "the third", "the other", "the above", "the former", "the latter", "besides the", "other than the", "this approach", "as mentioned", "that same", "the previous"];
for (const phrase of deixis) {
  await fixture(`deixis-${phrase.replaceAll(" ", "-")}`, "deixis", { valid: false, codes: ["question.stem.unbound"] }, (lesson) => {
    lesson.questions[0].stem = `When a passkey is removed, what does the server do, ${phrase} step aside?`;
  });
}
await fixture("deixis-capitalised", "deixis", { valid: false, codes: ["question.stem.unbound"] }, (lesson) => lesson.questions[0].stem = "The above happens when a passkey is removed. What does the server do?");
await fixture("deixis-inside-word", "deixis", { valid: true, codes: [], note: "\"the otherwise\" is not \"the other\": the rule is word-bounded." }, (lesson) => lesson.questions[0].stem = "When a passkey is removed, the otherwise idle epoch is used how?");

await fixture("reserved-numeric", "reserved-numeric", { valid: false, codes: ["numeric.reserved"] }, (lesson) => lesson.questions[2].reserved = true);
await fixture("reserved-numeric-only-reserved", "reserved-numeric", { valid: false, codes: ["numeric.reserved"], note: "The numeric is the only reserved Question of its Pool. pool.reserved.missing does NOT fire: the resolver counts a reserved numeric toward the Pool's reserved count even while rejecting it. Harmless today because numeric.reserved always rejects the document, but the two rules disagree about what a reserved Question is." }, (lesson) => {
  lesson.questions[4].reserved = false;
  lesson.questions[2].reserved = true;
});

await fixture("nesting-200-deep", "hostile-document", { valid: false, codes: ["document.nesting"], unknownProperties: true }, (lesson) => {
  let deep: unknown = [];
  for (let level = 0; level < 199; level++) deep = [deep];
  lesson.deep = deep;
});
await fixture("nesting-32-deep", "hostile-document", { valid: true, codes: [], unknownProperties: true, note: "Exactly the limit inside an unknown property: the resolver drops the property; the schema rejects the unknown key." }, (lesson) => {
  let deep: unknown = "leaf";
  for (let level = 0; level < 31; level++) deep = [deep];
  lesson.deep = deep;
});

await fixture("duplicate-card-id-across-concepts", "duplicate-ids", { valid: false, codes: ["card.id"], exact: false }, (lesson) => lesson.concepts[2].cards[0].id = lesson.concepts[0].cards[0].id);
await fixture("duplicate-pool-id-across-concepts", "duplicate-ids", { valid: false, codes: ["pool.id"], exact: false }, (lesson) => lesson.concepts[2].poolId = lesson.concepts[0].poolId);
await fixture("duplicate-question-id-across-concepts", "duplicate-ids", { valid: false, codes: ["question.id"] }, (lesson) => lesson.questions[9].id = lesson.questions[0].id);
await fixture("duplicate-option-id-across-concepts", "duplicate-ids", { valid: true, codes: [], note: "Option IDs are local to a Concept, so the same slug in two Concepts is allowed." }, (lesson) => {
  lesson.concepts[2].options[0].id = "bump";
  for (const question of lesson.questions.filter((q: any) => q.conceptId === lesson.concepts[2].id && q.type === "mcq")) {
    if (question.key === "drain") question.key = "bump";
    if ("drain" in question.map) {
      question.map.bump = question.map.drain;
      delete question.map.drain;
    }
    question.feedback.bump = question.feedback.drain;
    delete question.feedback.drain;
  }
});
await fixture("duplicate-misconception-id-in-concept", "duplicate-ids", { valid: false, codes: ["misconception.id"], exact: false }, (lesson) => lesson.concepts[2].misconceptions[1].id = lesson.concepts[2].misconceptions[0].id);

for (const name of ["__proto__", "constructor", "prototype"]) {
  await fixture(`reserved-name-option-${name}`, "reserved-names", { valid: false, codes: ["concept.option.id"], exact: false }, (lesson) => {
    const concept = lesson.concepts[2];
    const old = concept.options[0].id;
    concept.options[0].id = name;
    for (const question of lesson.questions.filter((q: any) => q.conceptId === concept.id && q.type === "mcq")) {
      if (question.key === old) question.key = name;
      if (old in question.map) {
        question.map[name] = question.map[old];
        delete question.map[old];
      }
      question.feedback[name] = question.feedback[old];
      delete question.feedback[old];
    }
  });
  await fixture(`reserved-name-misconception-${name}`, "reserved-names", { valid: false, codes: ["misconception.id"], exact: false }, (lesson) => {
    const concept = lesson.concepts[2];
    const old = concept.misconceptions[0].id;
    concept.misconceptions[0].id = name;
    for (const question of lesson.questions.filter((q: any) => q.conceptId === concept.id && q.type === "mcq")) {
      for (const [option, misconception] of Object.entries(question.map)) if (misconception === old) question.map[option] = name;
    }
  });
  await fixture(`reserved-name-top-level-${name}`, "reserved-names", { valid: true, codes: [], unknownProperties: true, note: "An unknown top-level key. The resolver drops it; the schema rejects it as a typo." }, (lesson) => {
    const text = JSON.stringify(lesson);
    Object.assign(lesson, JSON.parse(text.replace(/^\{/, `{${JSON.stringify(name)}:{"valid":true,"polluted":true},`)));
  });
}
await fixture("reserved-name-feedback-key", "reserved-names", { valid: false, codes: ["mcq.feedback.extra"] }, (lesson) => lesson.questions[0].feedback.__proto__ = "polluted");
await fixture("reserved-name-map-key", "reserved-names", { valid: false, codes: ["mcq.map.extra"] }, (lesson) => lesson.questions[0].map.constructor = "only_this_device");

await fixture("provenance-omitted", "provenance", { valid: false, codes: ["provenance.required"] }, (lesson) => delete lesson.provenance);
await fixture("provenance-declined", "provenance", { valid: true, codes: [] }, (lesson) => lesson.provenance = { status: "declined" });
await fixture("provenance-missing-model", "provenance", { valid: false, codes: ["provenance.model"] }, (lesson) => delete lesson.provenance.model);
await fixture("provenance-declined-with-fields", "provenance", { valid: true, codes: [], unknownProperties: true, note: "Declined plus the five fields: the resolver keeps only the status; the schema rejects the extra fields." }, (lesson) => lesson.provenance.status = "declined");
await fixture("provenance-status-unknown", "provenance", { valid: false, codes: ["provenance.required"] }, (lesson) => lesson.provenance.status = "maybe");

await fixture("valid-audit-lesson", "baseline", { valid: true, codes: [] }, () => {});

attacks.sort((a, b) => a.file.localeCompare(b.file));
await Deno.writeTextFile(new URL("manifest.json", here), JSON.stringify(attacks, null, 2) + "\n");
console.log(`${attacks.length} fixtures written`);

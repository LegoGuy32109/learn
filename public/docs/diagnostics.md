# lesson/v1 diagnostics reference

Generated from `src/shared/authoring/diagnostics.js` by `deno task tools:generate`.
Do not edit by hand. The same catalog is served as JSON at `/api/v1/diagnostics`.

Every diagnostic the resolver emits has a stable `code`, a JSON Pointer `path` into
the submitted document, a `severity` and a human `message`. Key on the code; the
message text can change. Diagnostics are sorted by path (numeric segments
numerically), then by code.

- An **error** makes the document invalid. The resolution API answers `422` and
  no draft is created.
- A **warning** leaves the document valid. The API answers `200` and includes it.

`document.object`, `document.nesting` and `document.size` run first and alone.
When one fires it is the only diagnostic returned.

The **Caught by** column says whether the JSON Schema at
`/api/v1/schemas/lesson/v1` also rejects a document with this problem. "Resolver
only" rules span items (IDs named elsewhere, word counts, lesson-wide ratios) and
are checked only by the resolver and the downloadable validator. Passing the
schema is necessary, not sufficient.

In paths, `<i>` and `<j>` stand for array indexes and `<optionId>` for an option
ID of the Concept.

## Errors (65)

| Code | Severity | Path | Caught by | Meaning | Fix |
| --- | --- | --- | --- | --- | --- |
| `document.object` | error | `(document)` | schema and resolver | The request body is not a JSON object. | Send one lesson document as a JSON object, not an array, string, number, null or boolean. |
| `document.nesting` | error | `(document)` | resolver only | The document nests deeper than 32 levels. | A lesson needs at most six levels. Remove the deeply nested value; it is not part of the contract. |
| `document.size` | error | `(document)` | resolver only | The serialized document is over 1,000,000 bytes. | Shorten capturedText excerpts or split the material into more than one lesson. |
| `schema.unsupported` | error | `/schema` | schema and resolver | The document does not declare schema lesson/v1. | Set "schema": "lesson/v1" at the top level. |
| `title.required` | error | `/title` | schema and resolver | title is missing or blank. | Give the lesson a title. |
| `assumedKnowledge.required` | error | `/assumedKnowledge` | schema and resolver | assumedKnowledge is missing or blank. | State in one sentence what the learner already knows. |
| `concepts.required` | error | `/concepts` | schema and resolver | concepts is missing or empty. | Add at least one Concept. |
| `sources.required` | error | `/sources` | schema and resolver | sources is missing or empty. | Add at least one structured source with type, title and locator. |
| `concept.id` | error | `/concepts/<i>/id` | resolver only | The Concept ID is not a UUIDv4 or repeats another Concept's ID. | Generate a fresh UUIDv4 for each Concept. |
| `concept.title` | error | `/concepts/<i>/title` | schema and resolver | The Concept title is missing or blank. | Give the Concept a title. |
| `concept.statement` | error | `/concepts/<i>/statement` | schema and resolver | statement is present but not a non-empty string. | Write the statement as one sentence, or remove the field. |
| `pool.id` | error | `/concepts/<i>/poolId` | resolver only | The poolId is not a UUIDv4 or repeats another Concept's poolId. | Generate a fresh UUIDv4 for each Concept's Pool. |
| `concept.options.count` | error | `/concepts/<i>/options` | schema and resolver | The Concept does not own exactly three options. | Write exactly three options shared by every MCQ in the Concept. |
| `concept.option.id` | error | `/concepts/<i>/options/<j>/id` | resolver only | The option ID repeats another option's ID in the Concept. | Use a short unique slug such as reuse or revalidate. |
| `concept.option.id.invalid` | error | `/concepts/<i>/options/<j>/id` | schema and resolver | The option ID is missing, does not match ^[A-Za-z0-9_-]{1,64}$, or is __proto__, constructor or prototype. | Use a short unique slug such as reuse or revalidate. |
| `concept.option.text` | error | `/concepts/<i>/options/<j>/text` | schema and resolver | The option text is missing or blank. | Write the option as the learner reads it. |
| `concept.options.ratio` | error | `/concepts/<i>/options` | resolver only | The longest option is more than 1.35 times the length of the shortest, so length signals the key. | Lengthen the short options or shorten the long one until the ratio is at most 1.35. |
| `concept.cards.minimum` | error | `/concepts/<i>/cards` | schema and resolver | The Concept has fewer than two Cards. | Split the idea into at least two Cards. Each Card teaches one idea. |
| `card.id` | error | `/concepts/<i>/cards/<j>/id` | resolver only | The Card ID is not a UUIDv4 or repeats another Card's ID anywhere in the lesson. | Generate a fresh UUIDv4 for each Card. |
| `card.heading` | error | `/concepts/<i>/cards/<j>/heading` | schema and resolver | The Card heading is missing or blank. | Give the Card a heading that states its one idea. |
| `card.body.paragraphs` | error | `/concepts/<i>/cards/<j>/body` | schema and resolver | body is not a non-empty array of paragraph strings. | Write body as an array of paragraphs, one string each. |
| `card.words` | error | `/concepts/<i>/cards/<j>/body` | resolver only | The Card is under 80 or over 200 words after inline HTML tags are stripped. | Write 80 to 200 words across the Card's paragraphs. |
| `misconception.id` | error | `/concepts/<i>/misconceptions/<j>/id` | resolver only | The misconception ID repeats another misconception's ID in the Concept. | Use a short unique slug that names the belief, such as fresh_means_newest. |
| `misconception.id.invalid` | error | `/concepts/<i>/misconceptions/<j>/id` | schema and resolver | The misconception ID is missing, does not match ^[A-Za-z0-9_-]{1,64}$, or is a reserved name. | Use a short unique slug that names the belief, such as fresh_means_newest. |
| `misconception.statement` | error | `/concepts/<i>/misconceptions/<j>/statement` | schema and resolver | The statement is missing or blank. | Write the belief itself, as the learner would hold it. |
| `misconception.card` | error | `/concepts/<i>/misconceptions/<j>/correctingCardId` | resolver only | correctingCardId is not the ID of a Card in the same Concept. | Name a Card of this Concept that corrects the belief. |
| `misconception.unused` | error | `/concepts/<i>/misconceptions/<j>` | resolver only | No MCQ distractor in the Concept maps to this misconception. | Map a distractor to it, or remove the misconception. |
| `question.id` | error | `/questions/<i>/id` | resolver only | The Question ID is not a UUIDv4 or repeats another Question's ID. | Generate a fresh UUIDv4 for each Question. |
| `question.concept` | error | `/questions/<i>/conceptId` | resolver only | conceptId is not the ID of a Concept in this lesson. | Set conceptId to the id of the Concept the Question checks. |
| `question.pool` | error | `/questions/<i>/poolId` | resolver only | poolId is not the poolId of the Question's Concept. | Copy the Concept's poolId onto the Question. |
| `question.type` | error | `/questions/<i>/type` | schema and resolver | type is not mcq, numeric or short. | Use one of mcq, numeric or short. |
| `question.stem` | error | `/questions/<i>/stem` | schema and resolver | The stem is missing or blank. | Write the question text. |
| `question.stem.unbound` | error | `/questions/<i>/stem` | schema and resolver | The stem contains an unbound reference such as "the above", "the second" or "this approach", so it does not stand alone once the Cards are gone. | Name the thing directly. The stem must make sense with the Cards removed. |
| `question.reserved` | error | `/questions/<i>/reserved` | schema and resolver | reserved is present but not a boolean. | Set reserved to true or false, or omit it for false. |
| `question.correctingCard` | error | `/questions/<i>/correctingCardId` | resolver only | correctingCardId is not the ID of a Card in the Question's Concept. | Name the Card of this Concept shown after I don't know or a wrong numeric or short answer. |
| `question.feedback` | error | `/questions/<i>/feedback` | schema and resolver | A numeric or short Question has no feedback string. | Write one or two sentences shown after any answer. |
| `mcq.key` | error | `/questions/<i>/key` | resolver only | key is not one option ID of the Concept's shared option set. | Set key to the id of the correct option in the Concept's options. |
| `mcq.map.shape` | error | `/questions/<i>/map` | schema and resolver | map is missing or is not an object of exactly two entries whose keys and values are local IDs. | Give map one entry per distractor: its option ID mapped to a misconception ID. |
| `mcq.feedback.shape` | error | `/questions/<i>/feedback` | schema and resolver | feedback is missing or is not an object of exactly three entries with local-ID keys and non-empty text. | Give feedback one entry per option ID, including the key, each a sentence or two. |
| `mcq.feedback.missing` | error | `/questions/<i>/feedback/<optionId>` | resolver only | An option of the Concept, possibly the key, has no feedback entry. | Add feedback for every option ID in the Concept's set, including the key. |
| `mcq.feedback.extra` | error | `/questions/<i>/feedback/<optionId>` | resolver only | feedback has a key that is not an option ID of the Concept. | Remove the entry or correct the option ID. |
| `mcq.map.missing` | error | `/questions/<i>/map/<optionId>` | resolver only | A distractor option has no map entry. | Map every non-key option ID to a misconception ID in the Concept. |
| `mcq.map.unknown` | error | `/questions/<i>/map/<optionId>` | resolver only | The map entry names a misconception ID that is not in the Concept. | Use an id from the Concept's misconceptions, or add the misconception there. |
| `mcq.map.extra` | error | `/questions/<i>/map/<optionId>` | resolver only | map has an entry for the key or for an ID that is not an option of the Concept. | Keep only the distractor option IDs in map. |
| `numeric.reserved` | error | `/questions/<i>/reserved` | schema and resolver | A numeric Question is marked reserved. | Reserve an MCQ or short Question for the Wrap-up instead; numeric Questions are never reserved. |
| `numeric.answer` | error | `/questions/<i>/answer` | schema and resolver | answer is not a finite number. | Set answer to a JSON number. |
| `numeric.answer.uncovered` | error | `/questions/<i>/answer` | resolver only | The answer, written as a number, appears in no Card of the Question's Concept. | Teach the number in a Card of the Concept, or ask about a number the Cards contain. |
| `numeric.tolerance.missing` | error | `/questions/<i>/tolerance` | schema and resolver | tolerance is missing or zero. | Set a positive tolerance from the claim being tested, not from the decimal places. |
| `numeric.tolerance` | error | `/questions/<i>/tolerance` | schema and resolver | tolerance is present but not a non-negative finite number. | Set tolerance to a positive JSON number. |
| `numeric.unit` | error | `/questions/<i>/unit` | schema and resolver | unit is present but not a string. | Set unit to a short string such as seconds, or omit it. |
| `short.answer` | error | `/questions/<i>/answer` | schema and resolver | A short Question has no canonical answer string. | Set answer to the accepted text. Matching ignores case and surrounding whitespace. |
| `short.aliases` | error | `/questions/<i>/aliases` | schema and resolver | aliases is present but not an array of non-empty strings. | List other accepted spellings as strings, or omit aliases. |
| `lesson.key.longest` | error | `/concepts` | resolver only | The key is the longest option in more than one third of the lesson's MCQs, so length signals the answer. | Rewrite options so the key is the longest in at most one third of MCQs, counted across the whole lesson. |
| `pool.reserved.missing` | error | `/concepts/<i>/poolId` | resolver only | No Question of this Concept's Pool is reserved for the Wrap-up. | Mark at least one MCQ or short Question of the Pool reserved: true. |
| `pool.drawable.minimum` | error | `/concepts/<i>/poolId` | resolver only | The Pool has fewer than three drawable (non-reserved) Questions, so the Check cannot ask once and re-ask twice. | Add drawable Questions to the Pool until it has at least three, plus one reserved. |
| `source.type` | error | `/sources/<i>/type` | schema and resolver | The source type is missing or blank. | Name the kind of source, such as specification, documentation, repository, commit or conversation. |
| `source.title` | error | `/sources/<i>/title` | schema and resolver | The source title is missing or blank. | Give the source a title. |
| `source.locator` | error | `/sources/<i>/locator` | schema and resolver | The source locator is missing or blank. | Give a URL, path, commit SHA or other way to find the source again. |
| `source.capturedText` | error | `/sources/<i>/capturedText` | schema and resolver | capturedText is present but neither a string nor null. | Set capturedText to an excerpt string, null, or omit it. |
| `provenance.required` | error | `/provenance` | schema and resolver | provenance is missing, or its status is neither provided nor declined. | Send { "status": "provided", ...five fields } or { "status": "declined" }. Omission is invalid. |
| `provenance.client` | error | `/provenance/client` | schema and resolver | status is provided but client is missing or blank. | Name the agent product, or use unknown. |
| `provenance.harness` | error | `/provenance/harness` | schema and resolver | status is provided but harness is missing or blank. | Name the runtime the agent ran in, or use unknown. |
| `provenance.model` | error | `/provenance/model` | schema and resolver | status is provided but model is missing or blank. | Give the model identifier, or use unknown. |
| `provenance.client_version` | error | `/provenance/client_version` | schema and resolver | status is provided but client_version is missing or blank. | Give the client version, or use unknown. |
| `provenance.session_reference` | error | `/provenance/session_reference` | schema and resolver | status is provided but session_reference is missing or blank. | Give an opaque session reference, or use unknown. |

## Warnings (1)

| Code | Severity | Path | Caught by | Meaning | Fix |
| --- | --- | --- | --- | --- | --- |
| `card.paragraphs.single` | warning | `/concepts/<i>/cards/<j>/body` | resolver only | The Card has one paragraph, so the clamped corrective view has nothing to expand. | Split the Card into at least two paragraphs. The first is shown after a wrong answer. |

# lesson.json reference (lesson/v1)

One file. The site validates and stores it; nothing else is authored. This
reference is rendered from the JSON Schema served at https://learn-joshhale.legoguy32109.deno.net/api/v1/schemas/lesson/v1,
so the field names and counts below are the server's own.

One lesson document authored by an external agent. This schema is necessary but not sufficient: it fixes shapes, counts and patterns. Rules that span items (option IDs named by MCQ keys and maps, Card membership, word counts, option-length ratio, the lesson-wide key-length rule, numeric answers covered by Cards, three drawable Questions and one reserved Question per Pool) are checked by the resolver at POST /api/v1/lesson-resolutions and by the downloadable validator. Every rule has a diagnostic code listed at /api/v1/diagnostics.

## Shape

```json
{
  "schema": "lesson/v1",
  "title": "Blocking a thread vs. yielding a task",
  "assumedKnowledge": "You have run both versions and seen the output.",
  "concepts": [
    {
      "id": "c0a8e6f2-1b7d-4c3e-9f21-6a5b4d3c2e10",
      "title": "Sleeping on one worker",
      "statement": "Say what each kind of sleep does to the worker, and predict the ordering of two tasks on one worker.",
      "poolId": "d1b9f7a3-2c8e-4d4f-8a32-7b6c5e4d3f21",
      "options": [
        {
          "id": "block",
          "text": "It blocks the worker thread. No other task on that worker can run."
        },
        {
          "id": "yield",
          "text": "It yields the task. The worker is free to run another task."
        },
        {
          "id": "own",
          "text": "Each task gets its own worker, so both make progress at the same time."
        }
      ],
      "misconceptions": [
        {
          "id": "block_yields",
          "statement": "std::thread::sleep lets other tasks run while it waits.",
          "correctingCardId": "e2c0a8b4-3d9f-4e5a-9b43-8c7d6f5e4a32"
        },
        {
          "id": "await_blocks",
          "statement": "Awaiting a sleep parks the whole worker thread.",
          "correctingCardId": "f3d1b9c5-4e0a-4f6b-8c54-9d8e7a6f5b43"
        }
      ],
      "cards": [
        {
          "id": "e2c0a8b4-3d9f-4e5a-9b43-8c7d6f5e4a32",
          "heading": "A blocking sleep costs you the whole worker",
          "body": [
            "First paragraph. The claim, then the mechanism.",
            "Second paragraph. A concrete instance: six blocking sleeps of 300ms on one worker print at about 1800ms. Then the consequence. 120 to 200 words across the whole Card."
          ]
        },
        {
          "id": "f3d1b9c5-4e0a-4f6b-8c54-9d8e7a6f5b43",
          "heading": "An awaited sleep hands the worker back",
          "body": [
            "First paragraph.",
            "Second paragraph."
          ]
        }
      ]
    }
  ],
  "questions": [
    {
      "id": "a4e2c0d6-5f1b-4a7c-9d65-0e9f8b7a6c54",
      "conceptId": "c0a8e6f2-1b7d-4c3e-9f21-6a5b4d3c2e10",
      "poolId": "d1b9f7a3-2c8e-4d4f-8a32-7b6c5e4d3f21",
      "type": "mcq",
      "reserved": false,
      "stem": "On a single-worker runtime, one of two spawned tasks calls std::thread::sleep(300ms). What does that call do?",
      "correctingCardId": "e2c0a8b4-3d9f-4e5a-9b43-8c7d6f5e4a32",
      "key": "block",
      "map": {
        "yield": "block_yields",
        "own": "await_blocks"
      },
      "feedback": {
        "block": "Right. The kernel parks the thread.",
        "yield": "That is the awaited version.",
        "own": "There is only one worker here."
      }
    },
    {
      "id": "b5f3d1e7-6a2c-4b8d-8e76-1f0a9c8b7d65",
      "conceptId": "c0a8e6f2-1b7d-4c3e-9f21-6a5b4d3c2e10",
      "poolId": "d1b9f7a3-2c8e-4d4f-8a32-7b6c5e4d3f21",
      "type": "numeric",
      "reserved": false,
      "stem": "Two tasks, three ticks each, 300ms blocking sleep per tick, one worker. Roughly what does main done print, in ms?",
      "correctingCardId": "e2c0a8b4-3d9f-4e5a-9b43-8c7d6f5e4a32",
      "answer": 1800,
      "tolerance": 150,
      "unit": "ms",
      "feedback": "About 1800. Six blocking sleeps run back to back."
    },
    {
      "id": "c6a4e2f8-7b3d-4c9e-9f87-2a1b0d9c8e76",
      "conceptId": "c0a8e6f2-1b7d-4c3e-9f21-6a5b4d3c2e10",
      "poolId": "d1b9f7a3-2c8e-4d4f-8a32-7b6c5e4d3f21",
      "type": "short",
      "reserved": false,
      "stem": "Which tokio function sleeps without holding the worker?",
      "correctingCardId": "f3d1b9c5-4e0a-4f6b-8c54-9d8e7a6f5b43",
      "answer": "tokio::time::sleep",
      "aliases": [
        "time::sleep",
        "tokio sleep"
      ],
      "feedback": "tokio::time::sleep. It returns a future; awaiting it yields the task."
    },
    {
      "id": "d7b5f3a9-8c4e-4d0f-8a98-3b2c1e0d9f87",
      "conceptId": "c0a8e6f2-1b7d-4c3e-9f21-6a5b4d3c2e10",
      "poolId": "d1b9f7a3-2c8e-4d4f-8a32-7b6c5e4d3f21",
      "type": "mcq",
      "reserved": true,
      "stem": "A task calls tokio::time::sleep(d).await on a single-worker runtime. What happens to the worker?",
      "correctingCardId": "f3d1b9c5-4e0a-4f6b-8c54-9d8e7a6f5b43",
      "key": "yield",
      "map": {
        "block": "await_blocks",
        "own": "block_yields"
      },
      "feedback": {
        "block": "Awaiting hands the worker back.",
        "yield": "Right. The runtime polls another task.",
        "own": "One worker, shared."
      }
    }
  ],
  "sources": [
    {
      "type": "repository",
      "title": "sleep-demo",
      "locator": "https://example.com/sleep-demo/commit/abc123",
      "capturedText": null
    }
  ],
  "provenance": {
    "status": "provided",
    "client": "Claude Code",
    "harness": "Claude Code CLI",
    "model": "claude-fable-5-1",
    "client_version": "unknown",
    "session_reference": "unknown"
  }
}
```

The example has one Concept so it fits on a page. A real lesson has three to
five, and every Card body runs 120 to 200 words. Concept, Pool, Card and
Question IDs are UUIDv4 generated once; option and misconception IDs are short
slugs local to their Concept.

## Top level

| Field | Required | Type | Meaning |
| --- | --- | --- | --- |
| `schema` | yes | `"lesson/v1"` | The lesson schema version. Independent of the API version. |
| `schemaVersion` | no | `1` | Optional numeric alias of schema; the resolver accepts either. |
| `title` | yes | string (non-empty) | The lesson title shown on the shelf. |
| `assumedKnowledge` | yes | string (non-empty) | One sentence naming what the learner already knows. |
| `concepts` | yes | array of [concept](#concept) (min 1) | Concepts in teaching order. Each owns its Cards, shared option set, misconceptions and one Pool ID. |
| `questions` | yes | array of [question](#question) (min 4) | All Questions, top level, each naming its Concept and that Concept's Pool. Every Pool needs at least three drawable Questions and one reserved Question. |
| `sources` | yes | array of [source](#source) (min 1) | Structured sources the lesson was authored from. |
| `provenance` | yes | [provenance](#provenance) |  |

Unknown top-level fields are rejected by the schema as likely typos. The
document may be at most 1,000,000 bytes.

## Definitions

### uuid

A UUIDv4. Concept, Pool, Card and Question IDs are UUIDv4 and unique across the lesson.

Type: string (pattern `^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$`).

### localId

A short stable identifier, unique within its Concept. Used for option and misconception IDs.

Type: string (pattern `^[A-Za-z0-9_-]{1,64}$`).

Never one of `__proto__`, `constructor`, `prototype`.

### text

Type: string (non-empty).

### stem

The Question text. It must stand alone with the Cards removed, so it may not contain an unbound reference such as "the above" or "this approach".

Type: string (non-empty).

Rejected when it matches `\b([Tt]he ([Ss]econd|[Tt]hird|[Oo]ther|[Aa]bove|[Ff]ormer|[Ll]atter)|[Bb]esides the|[Oo]ther than the|[Tt]his approach|[Aa]s mentioned|[Tt]hat same|[Tt]he previous)\b`.

### concept

| Field | Required | Type | Meaning |
| --- | --- | --- | --- |
| `id` | yes | [uuid](#uuid) |  |
| `title` | yes | [text](#text) | The Concept title shown on the rail. |
| `statement` | no | [text](#text) | Optional. What the learner can do after the Concept, as one sentence. |
| `poolId` | yes | [uuid](#uuid) | The ID of this Concept's Pool. Questions reference it as poolId. |
| `options` | yes | array of [option](#option) (min 3, max 3) | Exactly three options shared by every MCQ in the Concept. Option IDs are unique in the Concept. The longest text may be at most 1.35 times the shortest. |
| `misconceptions` | no | array of [misconception](#misconception) | The beliefs a wrong option reveals. Optional only for a Concept without MCQs; every misconception must be named by the map of some MCQ in this Concept. |
| `cards` | yes | array of [card](#card) (min 2) | At least two Cards. A Card teaches one idea. |

Unknown fields are rejected by the schema as likely typos.

### option

| Field | Required | Type | Meaning |
| --- | --- | --- | --- |
| `id` | yes | [localId](#localid) |  |
| `text` | yes | [text](#text) | The option as the learner reads it. |

Unknown fields are rejected by the schema as likely typos.

### misconception

| Field | Required | Type | Meaning |
| --- | --- | --- | --- |
| `id` | yes | [localId](#localid) |  |
| `statement` | yes | [text](#text) | The belief itself, written as the learner would hold it. |
| `correctingCardId` | yes | [uuid](#uuid) | A Card in the same Concept that corrects the belief. |

Unknown fields are rejected by the schema as likely typos.

### card

| Field | Required | Type | Meaning |
| --- | --- | --- | --- |
| `id` | yes | [uuid](#uuid) |  |
| `heading` | yes | [text](#text) |  |
| `body` | yes | array of [text](#text) (min 1) | Paragraphs. Inline HTML such as <code> and <em> is allowed. 120 to 200 words across the Card after tags are stripped. Write at least two paragraphs; the corrective view shows only the first. |

Unknown fields are rejected by the schema as likely typos.

### questionBase

| Field | Required | Type | Meaning |
| --- | --- | --- | --- |
| `id` | yes | [uuid](#uuid) |  |
| `conceptId` | yes | [uuid](#uuid) | The Concept this Question checks. |
| `poolId` | yes | [uuid](#uuid) | The poolId of that Concept. |
| `type` | yes | `"mcq"` or `"numeric"` or `"short"` |  |
| `reserved` | no | boolean | A reserved Question is never drawn by a Concept Check; the Wrap-up draws reserved Questions first. Each Pool needs at least one. |
| `stem` | yes | [stem](#stem) |  |
| `correctingCardId` | yes | [uuid](#uuid) | The Card in the Question's Concept shown after I don't know, or after a wrong numeric or short answer. |

### question

One Question. The type selects the variant.

Every Question has the fields of [questionBase](#questionbase).

The `type` selects exactly one variant: [mcq](#mcq), [numeric](#numeric), [short](#short). A field that belongs to no variant is rejected.

### mcq

| Field | Required | Type | Meaning |
| --- | --- | --- | --- |
| `type` | yes | `"mcq"` |  |
| `key` | yes | [localId](#localid) | The option ID of the correct option in the Concept's shared set. |
| `map` | yes | object of [localId](#localid) (min 2, max 2 entries) | One entry per distractor: the option ID maps to the ID of the misconception choosing it reveals. The key is not in the map. |
| `feedback` | yes | object of [text](#text) (min 3, max 3 entries) | One sentence or two per option, including the key, keyed by option ID. |

### numeric

| Field | Required | Type | Meaning |
| --- | --- | --- | --- |
| `type` | yes | `"numeric"` |  |
| `reserved` | no | `false` | A numeric Question is never reserved. |
| `answer` | yes | number | The number, which must appear in a Card of the Question's Concept. |
| `tolerance` | yes | number (> 0) | Accepted distance from the answer. Set it from the claim, not the decimal. Zero is not allowed. |
| `unit` | no | string | Optional unit shown beside the input. |
| `feedback` | yes | [text](#text) | Shown after any answer. |

### short

| Field | Required | Type | Meaning |
| --- | --- | --- | --- |
| `type` | yes | `"short"` |  |
| `answer` | yes | [text](#text) | The canonical answer. Matching ignores case and surrounding whitespace. |
| `aliases` | no | array of [text](#text) | Optional other accepted spellings. |
| `feedback` | yes | [text](#text) | Shown after any answer. |

### source

| Field | Required | Type | Meaning |
| --- | --- | --- | --- |
| `type` | yes | [text](#text) | The kind of source, such as specification, documentation, repository, commit or conversation. |
| `title` | yes | [text](#text) |  |
| `locator` | yes | [text](#text) | A URL, path, commit SHA or other way to find the source again. |
| `capturedText` | no | string or null | Optional excerpt captured at authoring time. |

Unknown fields are rejected by the schema as likely typos.

### provenance

Which agent authored the lesson. Provide every field or decline explicitly. Omission is invalid.

One of:

**Form 1**

| Field | Required | Type | Meaning |
| --- | --- | --- | --- |
| `status` | yes | `"provided"` |  |
| `client` | yes | [text](#text) | The agent product, or unknown. |
| `harness` | yes | [text](#text) | The runtime the agent ran in, or unknown. |
| `model` | yes | [text](#text) | The model identifier, or unknown. |
| `client_version` | yes | [text](#text) | The client version, or unknown. |
| `session_reference` | yes | [text](#text) | An opaque reference to the authoring session, or unknown. |

**Form 2**

| Field | Required | Type | Meaning |
| --- | --- | --- | --- |
| `status` | yes | `"declined"` |  |

## Pool sizing

`"reserved": true` marks the Question the Concept Check never draws. It exists
so the Wrap-up always has something unseen. Each Pool needs at least
3 drawable Questions plus one reserved, because a Concept where the learner
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

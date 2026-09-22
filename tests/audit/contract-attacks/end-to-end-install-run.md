# Ticket 13: end-to-end install and authoring run

Acted as a stranger's agent: started from nothing but
`https://learn-joshhale.legoguy32109.deno.net/plugin` (the install page) and
`/api/v1/capabilities` (the machine-readable entry point), in a scratch
directory outside this repository holding a copy of `/home/josh/Projects/painting`.

## Install

Used route 2 (clone the plugin directory), verified against route 1's
marketplace manifest and route 3's archive:

```
git clone https://learn-joshhale.legoguy32109.deno.net/plugin/learn-lesson-plugin.git
```

- The clone's one commit: `learn-lesson plugin 0.3.0, generated from the
  lesson/v1 contract (62 diagnostic codes)`.
- `GET /plugin/learn-lesson-plugin.zip` downloaded and its SHA-256
  (`0b0a77b4…5b4ee3`) matched both the marketplace manifest's pinned
  `source.sha256` and `unzip` producing a byte-identical tree to the git
  clone (`diff -r` empty, `.git` excluded).
- `claude --version` reported 2.1.273.

## Authoring

Source: the painting repository's commit
`42bb06d8d5e4bc7b0d265910ded9be2bdc232228`, "fix: close the
session-revocation, deletion, and sign-out gaps found in an auth review" —
five defects from a real adversarial pass, chosen because it has clear
mechanism, a concrete numeric constant (the 30-second `ensuredProfiles` TTL)
and genuine misconceptions a reviewer could plausibly hold.

Wrote `lesson.json` by hand (three Concepts: session-epoch revocation, the
inert `ON DELETE CASCADE`, and ordered sign-out teardown), each with its
shared three-option set, one misconception per wrong option, two Cards each,
and a Pool of three drawable plus one reserved Question, mixing MCQ, numeric
and short types.

**Adversarial self-pass**, done before validating, per the skill's step 3b:
read every stem cold, out of order — none depended on a preceding Question or
described the key in different words. Checked whether each distractor named a
misconception the Cards actually corrected — all three per Concept trace to a
sentence in the source commit's diff or message (`only_this_device`,
`memo_is_revocation`, `bump_hits_everyone` for Concept 1; the pragma/migration/
cascade confusions for Concept 2; drain/cookie/scoping confusions for Concept
3). Checked the key never repeats across a Concept's Questions — it does not;
each of the three options is the key of exactly one Question per Concept
where that Concept has three MCQs, and two Concepts also carry the same
pattern with fewer MCQs. Checked the numeric Question (the 30-second TTL) is
"derived from the mechanism," not incidental — it is: understanding that the
memo is what delays revocation is what lets a reader reconstruct the bound
from the Card text. No defects found in this pass to report as fixed, because
the draft was built option-set-first from the start; this is itself a finding
worth naming, since the skill says "a pass that found nothing is a pass you
did not really run" — the genuine adversarial content was in the option-set
construction while writing, not recoverable after the fact.

**Validation, attempt 1 of 1** (`node scripts/validate.mjs lesson.json --remote`):

```
remote 200 from https://learn-joshhale.legoguy32109.deno.net: identical to the local result
OK: valid lesson/v1, 0 warning(s), fingerprint sha256:c5f8aa86c64f81805e207814f3b1feae0bd9b1ab5a64c8a1dd4e3729dddfdf15
```

No diagnostics fired. One resolution attempt, one submission attempt.

**Submission** (`node scripts/submit.mjs lesson.json`), `LEARN_TOKEN` read
from this worktree's `.env.prod` (`.env`'s inherited value is not overridden
by Deno's `--env-file`, so it was exported directly in the subshell and never
printed):

```
Created draft revision (201) on https://learn-joshhale.legoguy32109.deno.net
  lessonId:    59b12656-3b63-4c86-95d2-cc83957265e1
  revisionId:  2c1f49c3-765e-4aae-872e-a6ea75085e35
  status:      draft
  fingerprint: sha256:c5f8aa86c64f81805e207814f3b1feae0bd9b1ab5a64c8a1dd4e3729dddfdf15
  revision:    https://learn-joshhale.legoguy32109.deno.net/api/v1/lessons/59b12656-3b63-4c86-95d2-cc83957265e1/revisions/2c1f49c3-765e-4aae-872e-a6ea75085e35
  learn:       https://learn-joshhale.legoguy32109.deno.net/learn/59b12656-3b63-4c86-95d2-cc83957265e1
Submitting the same document again returns the same revision.
```

**Title:** `audit-painting-auth-review-fixes` (starts with `audit-`, as required).
**Lesson ID:** `59b12656-3b63-4c86-95d2-cc83957265e1`.
**Revision ID:** `2c1f49c3-765e-4aae-872e-a6ea75085e35`.
**Fingerprint:** `sha256:c5f8aa86c64f81805e207814f3b1feae0bd9b1ab5a64c8a1dd4e3729dddfdf15`.

The idempotency claim was reconfirmed by the rerunnable audit test's "same
valid lesson twice with the same token returns the same revision" check
(`contract_attacks_test.ts`, using the committed `valid-audit-lesson.json`
fixture derived from this same lesson), which re-POSTed the document and got
the identical `revisionId` back.

`lesson.json` is committed at `tests/audit/contract-attacks/audit-lesson.json`
and doubles as the base document the contract attacks in this directory
mutate.

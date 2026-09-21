# 13 — Verify the authoring contract and the plugin end to end

**What to do:** Act as a stranger's agent. Start from nothing but the
capability document URL and the site's install page. Install the plugin as the
page says, in a repository that is not this one, and follow the skill to make
a lesson about a real piece of work in that repository. Record how many
resolution attempts it took and which diagnostics fired. Then attack the
contract. Report defects as new ticket files. Do not fix anything.

Attacks to run against both the resolution API and the downloaded validator,
asserting identical result JSON:

- A lesson the plugin's own `validate.mjs` rejects for each of its rules,
  translated to `lesson/v1`. Each must fail with the matching diagnostic code.
- A lesson whose key is the longest option in every MCQ.
- A lesson whose Card is 119 and 201 words.
- A stem with each deixis phrase.
- A reserved numeric Question.
- A body at the size limit plus one byte, a document nested 200 levels deep,
  duplicate IDs across Concepts, and keys named `__proto__`, `constructor`
  and `prototype`.
- Provenance omitted, declined, and provided with one missing field.
- The same valid lesson twice with the same token, then with a different
  account's token.

Confirm the JSON Schema rejects what the resolver rejects and accepts what it
accepts for every fixture, using an independent draft 2020-12 validator, not
the project's code. Confirm the OpenAPI document describes every route the
server answers, by probing each route in the document and each route the
server exposes.

Search the repository the skill ran in, the skill's output and the shell
history for the bearer token.

**Blocked by:** 03 — Complete JSON Schema, OpenAPI and diagnostic-code
documentation; 04 — Installable agent plugin served by the site.

**Status:** ready-for-agent

- [ ] The end-to-end run is documented: install route used, attempts, and
      diagnostics per attempt, with the created revision ID.
- [ ] Every attack has a fixture, the API result, the validator result and a
      byte-equality assertion, committed as a test the swarm can rerun.
- [ ] Every schema and OpenAPI mismatch is a ticket.
- [ ] The token search comes back empty and the command used is in the report.

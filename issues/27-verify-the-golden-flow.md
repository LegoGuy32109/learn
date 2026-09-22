# 27 — Verify the golden flow end to end, from a working agent session to Learned

**What to do:** This is the acceptance test for the whole stage. Josh described
the flow he wants; walk it exactly as he would, find everything that makes it
worse than described, and report. Audit only. Never fix, and never change a
database by hand.

The flow, in his words, reshaped as steps:

1. **Setup, once.** Mint a token with the token script. Export it as
   `LEARN_TOKEN`. Install the plugin from the live site into a coding project
   that is not this repository. Mint a sign-in invite, open it in a
   phone-emulated browser, register a passkey, and add the site to the home
   screen.
2. **From a working agent session.** In that other project, with real work
   just done in it, invoke the plugin's skill the way Josh would: ask for a
   lesson on what was just changed. Let the skill do its own job. Do not hand
   it the answer, do not pre-write the lesson, and do not fix its output for
   it. Record every attempt it needed and every diagnostic it hit.
3. **On the phone.** Open the app from the home screen as the signed-in owner.
   The new lesson is on the shelf as Not started, newest first. Open it, read
   the overview, start it, and complete the whole lesson to Learned: Cards,
   a wrong answer in a Check with the belief and the correcting Card, an
   "I don't know", the Wrap-up, and the Learned summary.
4. **Offline.** Partway through, go offline, close the app, reopen from the
   icon, and resume at the exact Card or Question. Finish a Concept offline.
   Come back online and confirm the progress reaches the server.
5. **Second device.** Open a second signed-in context. It shows the same
   progress and resumes at the same place.
6. **Re-testing.** From the overview choose Every question, answer a few, and
   confirm the shelf state does not change.

Run it against production. Use the deployed URL until the custom domain is
attached. Read the owner token from the `.env.prod` file itself, because
Deno's `--env-file` never overrides an inherited variable, and never print it.

Judge the flow, not just the assertions. For every step, answer two questions
in the report: did it work, and would Josh have had to know something that is
written nowhere? A step that works only because the auditor knew an undocumented
detail is a finding.

**Blocked by:** None — every ticket it exercises is merged.

**Status:** ready-for-agent

- [ ] Every step above is walked against production and recorded with its
      evidence: the command, the response, or a screenshot.
- [ ] The skill run is reported honestly: attempts, diagnostics, and whether
      the lesson it produced is one Josh would want to learn from. Quote two
      or three of its Questions.
- [ ] Each defect is a new ticket file numbered from 50 upward with a
      reproduction.
- [ ] The report ends with one paragraph answering the only question that
      matters: can Josh do this flow today, from a coding session to his
      phone, without being told anything that is not written down?

## Verification

```bash
deno task audit:golden
```

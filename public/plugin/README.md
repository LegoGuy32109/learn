# learn-lesson

Turn the work an agent just did into a retrieval-practice lesson that Josh
opens on his phone at learn.joshhale.me.

Ask for a lesson on something: code an agent just wrote, a diff, a document, a
repository. The `lesson` skill reads the source, writes `lesson.json`, attacks its
own draft, validates it with the site's own validator and creates a private
draft through the API. You get back a URL.

## Install

Three routes, all served by the site. Pick one.

**Claude Code plugin.** Add the site's marketplace, then install:

```bash
claude plugin marketplace add https://learn-joshhale.legoguy32109.deno.net/plugin/marketplace.json
claude plugin install learn-lesson@learn-joshhale
```

The marketplace names one plugin whose source is the archive below, pinned by
its SHA-256.

**Clone the plugin directory.** The site serves it as a Git repository:

```bash
git clone https://learn-joshhale.legoguy32109.deno.net/plugin/learn-lesson-plugin.git
claude --plugin-dir ./learn-lesson-plugin
```

Or download and unpack the archive: `https://learn-joshhale.legoguy32109.deno.net/plugin/learn-lesson-plugin.zip`.
`claude --plugin-dir` also accepts the `.zip` directly.

**Copy the one skill.** Everything the skill needs is inside
`skills/lesson/`. Copy that directory into `~/.claude/skills/lesson` (or a
project's `.claude/skills/lesson`) and the skill is available without the
plugin. The scripts run under Node 20+ or Deno.

## The token

The skill reads Josh's bearer token from the `LEARN_TOKEN` environment variable
of the shell that runs the agent. It never prints the token, never writes it
into a lesson or a log and never passes it on a command line. Mint one with
`lessons:write` scope using the site's `token:mint` task.

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

## Why 3 options, always the same 3

Within a Concept, every MCQ offers the identical 3 options and only the
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
`skills/lesson/references/diagnostics.md`.

## Generated, not written

Every text in this plugin is generated from the site's own sources by
`deno task plugin:generate`: the resolver's constants, the JSON Schema and the
diagnostics catalog. Do not edit the files here; change the sources and
regenerate. Version 0.3.0.

## Credits

The question construction follows Little et al. on competitive distractors.
The flow follows the learn.joshhale.me lesson specification. This plugin is
the `quiz` plugin (0.2.0) re-pointed at the site.

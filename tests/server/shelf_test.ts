// The reads the phone shelf needs: the account's lessons newest first with each newest revision,
// the revision content to cache, and the page shell that inlines the owner's lesson at a learning
// URL. Every read accepts the browser session cookie or a `lessons:read` bearer token.
import type { ShelfLesson } from "../../src/server/repositories/lessons.ts";
import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { DEMO_LESSON as fixture } from "../support/demo-lesson.ts";
import { resolveLesson } from "../../src/shared/authoring/resolver.js";
import {
  createApp,
  FIXTURE_ACCOUNT,
  fixtureDependencies,
} from "../../src/app.ts";
import { FixtureLessonRepository } from "../../src/server/repositories/lessons.ts";
import { stubAuthenticator } from "../support/stub-auth.ts";

const ORIGIN = "http://localhost";
const OWNER = "owner-token";
const WRITER_ONLY = "writer-token";
const STRANGER = "stranger-token";

async function harness() {
  let now = Date.parse("2026-09-21T12:00:00Z");
  const dependencies = {
    ...await fixtureDependencies(),
    lessons: new FixtureLessonRepository(
      fixture,
      FIXTURE_ACCOUNT.id,
      () => now,
    ),
    auth: stubAuthenticator({
      [OWNER]: {
        accountId: FIXTURE_ACCOUNT.id,
        scopes: ["lessons:read", "lessons:write"],
      },
      [WRITER_ONLY]: {
        accountId: FIXTURE_ACCOUNT.id,
        scopes: ["lessons:write"],
      },
      [STRANGER]: {
        accountId: "someone-else",
        scopes: ["lessons:read", "lessons:write"],
      },
    }),
  };
  const app = createApp(dependencies);
  const call = (path: string, init: RequestInit = {}) =>
    app(new Request(`${ORIGIN}${path}`, init));
  const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
  const cookie = async () => {
    const setCookie = await dependencies.sessions.issue(new Request(ORIGIN), {
      accountId: FIXTURE_ACCOUNT.id,
      displayName: "Josh",
    });
    return { cookie: setCookie.split(";")[0] };
  };
  const create = async (title: string, token = OWNER, lessonId?: string) => {
    now += 1000;
    const document = { ...structuredClone(fixture), title } as Record<
      string,
      unknown
    >;
    delete document.lessonId;
    delete document.revisionId;
    const path = lessonId
      ? `/api/v1/lessons/${lessonId}/revisions`
      : "/api/v1/lessons";
    const response = await call(path, {
      method: "POST",
      headers: { ...bearer(token), "content-type": "application/json" },
      body: JSON.stringify(document),
    });
    const text = await response.text();
    assertEquals(response.status, 201, text);
    return JSON.parse(text);
  };
  return { app, call, bearer, cookie, create };
}

Deno.test("the shelf needs an account: 401 for nobody, 403 for a token without lessons:read", async () => {
  const h = await harness();
  const anonymous = await h.call("/api/v1/shelf");
  assertEquals(anonymous.status, 401);
  assertEquals(
    anonymous.headers.get("content-type"),
    "application/problem+json; charset=utf-8",
  );
  await anonymous.body?.cancel();
  const forbidden = await h.call("/api/v1/shelf", {
    headers: h.bearer(WRITER_ONLY),
  });
  assertEquals(forbidden.status, 403);
  assertStringIncludes((await forbidden.json()).detail, "lessons:read");
  const bogus = await h.call("/api/v1/shelf", {
    headers: { cookie: "learn_session=v1.not.real" },
  });
  assertEquals(bogus.status, 401);
  await bogus.body?.cancel();
});

Deno.test("the shelf lists the account's lessons newest first with each newest revision, by cookie or by bearer", async () => {
  const h = await harness();
  const first = await h.create("A lesson from the laptop");
  const second = await h.create("Another lesson");
  await h.create("Not yours", STRANGER);
  const revised = await h.create(
    "A lesson from the laptop, revised",
    OWNER,
    first.lessonId,
  );
  assertEquals(revised.lessonId, first.lessonId);
  assertEquals(revised.revisionNumber, 2);

  for (const headers of [h.bearer(OWNER), await h.cookie()]) {
    const response = await h.call("/api/v1/shelf", { headers });
    assertEquals(response.status, 200);
    assertEquals(response.headers.get("cache-control"), "private, no-store");
    const { lessons }: { lessons: ShelfLesson[] } = await response.json();
    assertEquals(lessons.map((lesson) => lesson.title), [
      "A lesson from the laptop, revised",
      "Another lesson",
      fixture.title,
    ]);
    assertEquals(lessons[0].lessonId, first.lessonId);
    assertEquals(lessons[0].latestRevisionId, revised.revisionId);
    assertEquals(lessons[0].latestRevisionNumber, 2);
    assertEquals(lessons[1].latestRevisionId, second.revisionId);
    assertEquals(lessons[0].conceptCount, 3);
    assertEquals(lessons[0].questionCount, fixture.questions.length);
    assertEquals(lessons[2].status, "published");
    assert(
      lessons.every((lesson) => !("content" in lesson)),
      "the shelf never carries content",
    );
  }
});

Deno.test("a revision and a lesson's newest revision are readable with the cookie, and only by their owner", async () => {
  const h = await harness();
  const created = await h.create("Cached on open");
  const cookie = await h.cookie();
  const revision = await h.call(
    `/api/v1/lessons/${created.lessonId}/revisions/${created.revisionId}`,
    { headers: cookie },
  );
  assertEquals(revision.status, 200);
  const stored = await revision.json();
  assertEquals(stored.content.title, "Cached on open");
  assertEquals(stored.content.lessonId, created.lessonId);
  assertEquals(stored.content.revisionId, created.revisionId);

  const latest = await h.call(`/api/v1/lessons/${created.lessonId}`, {
    headers: cookie,
  });
  assertEquals(latest.status, 200);
  assertEquals((await latest.json()).revisionId, created.revisionId);

  const stranger = await h.call(
    `/api/v1/lessons/${created.lessonId}/revisions/${created.revisionId}`,
    { headers: h.bearer(STRANGER) },
  );
  assertEquals(stranger.status, 404);
  await stranger.body?.cancel();
  const anonymous = await h.call(`/api/v1/lessons/${created.lessonId}`);
  assertEquals(anonymous.status, 401);
  await anonymous.body?.cancel();
  const listed = await h.call("/api/v1/lessons", { headers: cookie });
  assertEquals(listed.status, 200);
  assert(
    ((await listed.json()) as { revisions: Array<{ revisionId: string }> })
      .revisions.some((entry) => entry.revisionId === created.revisionId),
  );
});

Deno.test("the learning URL inlines the owner's newest revision for the signed-in owner and the featured lesson for anyone else", async () => {
  const h = await harness();
  const created = await h.create("Only the owner sees this inlined");
  const owner = await h.call(`/learn/${created.lessonId}`, {
    headers: await h.cookie(),
  });
  assertEquals(owner.status, 200);
  const ownerHtml = await owner.text();
  assertStringIncludes(ownerHtml, "Only the owner sees this inlined");
  assertStringIncludes(ownerHtml, '"signedIn":true');

  const guest = await h.call(`/learn/${created.lessonId}`);
  const guestHtml = await guest.text();
  assertEquals(guestHtml.includes("Only the owner sees this inlined"), false);
  assertStringIncludes(guestHtml, fixture.title);
  assertStringIncludes(guestHtml, '"signedIn":false');

  const home = await h.call("/", { headers: await h.cookie() });
  assertStringIncludes(await home.text(), fixture.title);
});

Deno.test("the in-memory repository behaves like the database one: idempotent fingerprints and owned revisions", async () => {
  const repository = new FixtureLessonRepository(fixture, "owner");
  const resolved = await resolveLesson({
    ...structuredClone(fixture),
    title: "Memory",
  });
  assert(resolved.valid);
  const first = await repository.createLesson("owner", resolved);
  const again = await repository.createLesson("owner", resolved);
  assertEquals(again.revisionId, first.revisionId);
  assertEquals(
    (await repository.shelf("owner")).map((lesson) => lesson.title),
    ["Memory", fixture.title],
  );
  assertEquals(await repository.latestRevision("other", first.lessonId), null);
  assertEquals(
    (await repository.latestRevision("owner", first.lessonId))?.revisionId,
    first.revisionId,
  );
  assertEquals((await repository.featured()).title, fixture.title);
});

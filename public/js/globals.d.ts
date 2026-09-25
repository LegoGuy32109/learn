// The values the server inlines into a page before its module scripts run. A page reads them as
// `/** @type {typeof globalThis & PageGlobals} */ (globalThis)`.

export interface PageGlobals {
  /** The lesson the page inlined for its first paint; absent on the offline `/shell` document. */
  __LESSON__?: import("../../src/shared/lessons/types.d.ts").Lesson;
  /** The signed-in account as the server rendered it. Never carries a credential. */
  __SESSION__?: { signedIn: boolean; displayName: string | null };
  /** The invite the invite page was rendered for. */
  __INVITE__?: { token: string; displayName: string };
}

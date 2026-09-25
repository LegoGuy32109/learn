interface Window {
  /** The lesson the page inlined; absent on the offline `/shell` document. */
  __LESSON__?: import("../../src/shared/lessons/types.d.ts").Lesson;
  __SESSION__: { signedIn: boolean; displayName: string | null };
  __INVITE__: { token: string; displayName: string };
}

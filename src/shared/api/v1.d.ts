// The JSON bodies of /api/v1, as the server sends them. The routes check their replies against
// these types with `satisfies`, and the browser and the tests read replies as them.

import type { Lesson } from "../lessons/types.d.ts";

/** RFC 9457 problem details. Structured refusals add a `code` and their own members. */
export interface Problem {
  type: string;
  title: string;
  status: number;
  detail: string;
  code?: string;
}

/** A Lesson's progress stream: the revision it is pinned to and the epoch evidence goes under. */
export interface StreamState {
  lessonId: string;
  lessonRevisionId: string;
  epoch: number;
}

/** `POST /api/v1/progress/{stream}` accepted the batch. */
export interface PushReply {
  accepted: number;
  duplicates: number;
  stream: StreamState | null;
}

/** One rejected event, with the JSON Pointer of the field at fault relative to the events array. */
export interface EventRejection {
  index: number;
  id: string | null;
  code: string;
  path: string;
  message: string;
}

/** `POST /api/v1/progress/{stream}` refused the whole batch. */
export interface RejectedReply extends Problem {
  code: "events.rejected";
  rejections: EventRejection[];
}

/** A push or read under an epoch another device discarded. */
export interface StaleEpochReply extends Problem {
  code: "epoch.stale";
  stream: StreamState | null;
}

/** An event as a pull returns it: the envelope every stream shares, plus its own fields. */
export type PulledEvent =
  & {
    id: string;
    type: string;
    lessonRevisionId: string;
    epoch: number;
    occurredAt: string;
  }
  & Record<string, unknown>;

/** `GET /api/v1/progress/{stream}`: one page after the cursor. */
export interface PullReply {
  events: PulledEvent[];
  cursor: string;
  hasMore: boolean;
  stream: StreamState | null;
}

/** `GET /api/v1/progress/checkpoint`: the canonical resume position for one revision and epoch. */
export interface CheckpointReply {
  checkpoint: unknown;
  frontier: number;
  learningEvents: number;
  stream: StreamState | null;
}

/** One shelf card: a Lesson and its newest revision. Content is not included. */
export interface ShelfLessonReply {
  lessonId: string;
  title: string;
  conceptCount: number;
  questionCount: number;
  latestRevisionId: string;
  latestRevisionNumber: number;
  status: RevisionStatus;
  updatedAt: number;
}

/** `GET /api/v1/shelf`. */
export interface ShelfReply {
  lessons: ShelfLessonReply[];
}

export type RevisionStatus = "draft" | "published" | "superseded" | "withdrawn";

/** One revision in `GET /api/v1/lessons`. */
export interface RevisionListing {
  lessonId: string;
  revisionId: string;
  revisionNumber: number;
  status: string;
  title: string;
  fingerprint: string;
  createdAt: number;
}

/** `GET /api/v1/lessons`. */
export interface LessonsReply {
  revisions: RevisionListing[];
}

/** A stored Lesson Revision, as `POST /api/v1/lessons` and the revision reads return it. */
export interface RevisionReply {
  lessonId: string;
  revisionId: string;
  revisionNumber: number;
  status: RevisionStatus;
  fingerprint: string;
  content: Lesson;
  createdAt: number;
}

/** `GET /api/v1/session`, and the reply to a completed passkey ceremony. */
export interface SessionReply {
  signedIn: boolean;
  displayName: string | null;
}

/** `POST /api/v1/sign-in-invites`. */
export interface InviteReply {
  url: string;
  path: string;
  expiresAt: number;
}

/** `POST /api/v1/passkeys/registration-options`. */
export interface RegistrationOptionsReply {
  options: PublicKeyCredentialCreationOptionsJSON;
}

/** `POST /api/v1/passkeys/authentication-options`. */
export interface AuthenticationOptionsReply {
  options: PublicKeyCredentialRequestOptionsJSON;
}

/** Any API request from a copy of the application older than the server's API revision. */
export interface OutdatedClientReply extends Problem {
  code: "client.outdated";
  /** The API revision the server speaks. */
  revision: number;
}

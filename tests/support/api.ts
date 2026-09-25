// Reply shapes as the tests use them, where a test's own inputs narrow a documented reply.
import type { CheckpointReply } from "../../src/shared/api/v1.d.ts";

/** The checkpoint reply, holding checkpoints a test wrote: each names itself with a marker. */
export interface MarkedCheckpointReply
  extends Omit<CheckpointReply, "checkpoint"> {
  checkpoint: ({ marker?: string } & Record<string, unknown>) | null;
}

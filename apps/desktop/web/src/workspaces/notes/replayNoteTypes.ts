// SPDX-License-Identifier: GPL-3.0-only

export type { ReplayNoteType } from "@zinuto/shared/replayNoteBuilder";
import type { ReplayNoteType } from "@zinuto/shared/replayNoteBuilder";

export type SpecialTrainingReplayNoteType = Extract<
  ReplayNoteType,
  "CHALLENGE"
>;

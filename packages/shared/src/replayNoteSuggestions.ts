// SPDX-License-Identifier: GPL-3.0-only

import type {
  ReplayNoteBuilderLanguage,
  ReplayNoteBuilderType,
} from "./replayNoteBuilder.js";

export type ReplayNoteSuggestionLayer = "LIVE_SIGNAL" | "POSTMORTEM";

export type ReplayNoteSuggestionCandidate = {
  id: string;
  key: string;
  label: string;
  layer: ReplayNoteSuggestionLayer;
  score: number;
  reasonCode: string;
  evidence: string;
};

export type ReplayNoteSuggestionSummaryChip = {
  label?: unknown;
  value?: unknown;
  tone?: unknown;
};

export type ReplayNoteSuggestionBarsLike = {
  ts?: unknown;
  open?: unknown;
  high?: unknown;
  low?: unknown;
  close?: unknown;
};

export type ReplayNoteSuggestionArchive = {
  bars?: readonly ReplayNoteSuggestionBarsLike[];
  snapshot?: Record<string, unknown>;
  tradeRounds?: readonly unknown[];
  noteSummary?: {
    chips?: readonly ReplayNoteSuggestionSummaryChip[];
  };
  specialTraining?: Record<string, unknown> | null;
};

export type BuildReplayNoteSuggestionCandidatesParams = {
  noteType: ReplayNoteBuilderType;
  language: ReplayNoteBuilderLanguage;
  contextReplay?: ReplayNoteSuggestionArchive | null;
};

export const buildReplayNoteSuggestionCandidates = (
  _params: BuildReplayNoteSuggestionCandidatesParams,
): ReplayNoteSuggestionCandidate[] => [];

// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import {
  buildReplayNoteDefaultTitle,
  buildReplayNoteSeedMeta,
  buildReplayNoteSourceForCreate,
  resolveReplayNoteReflectionSectionLabel,
  resolveReplayNoteSemanticLabel,
} from "../dist/replayNoteBuilder.js";

test("replay note labels only expose the three canonical types", () => {
  assert.equal(resolveReplayNoteSemanticLabel("zh-CN", "FREE_REPLAY"), "推演笔记");
  assert.equal(resolveReplayNoteSemanticLabel("zh-CN", "CHALLENGE"), "挑战笔记");
  assert.equal(resolveReplayNoteSemanticLabel("en", "CUSTOM"), "Custom Note");
});

test("structured reflection headings resolve from localized JSON catalogs", () => {
  assert.equal(
    resolveReplayNoteReflectionSectionLabel("zh-CN", "riskReflection"),
    "风控反思",
  );
  assert.equal(
    resolveReplayNoteReflectionSectionLabel("en", "riskReflection"),
    "Risk Reflection",
  );
  assert.equal(
    resolveReplayNoteReflectionSectionLabel("ja", "riskReflection"),
    "リスクの振り返り",
  );
  assert.equal(
    resolveReplayNoteReflectionSectionLabel("ko", "riskReflection"),
    "리스크 복기",
  );
  assert.equal(
    resolveReplayNoteReflectionSectionLabel("es", "riskReflection"),
    "Reflexión sobre riesgo",
  );
});

test("free replay notes keep training project source context", () => {
  assert.deepEqual(
    buildReplayNoteSourceForCreate({
      noteType: "FREE_REPLAY",
      trainingProjectId: "session-1",
      contextSessionId: "session-1",
      symbol: "AAPL",
    }),
    {
      kind: "TRAINING_PROJECT",
      id: "session-1",
      label: "AAPL",
    },
  );
});

test("challenge notes keep question source context", () => {
  assert.deepEqual(
    buildReplayNoteSourceForCreate({
      noteType: "CHALLENGE",
      trainingProjectId: "question-1",
      contextSessionId: "question-1",
      symbol: "TSLA",
    }),
    {
      kind: "SPECIAL_TRAINING_QUESTION",
      id: "question-1",
      label: "TSLA",
    },
  );
});

test("default title uses the new note type labels", () => {
  assert.equal(
    buildReplayNoteDefaultTitle({
      language: "zh-CN",
      noteType: "FREE_REPLAY",
      createdAt: "2026-04-25T12:00:00.000Z",
      symbol: "msft",
      displayPeriod: "1d",
      profitLossRatio: 2.5,
      winRate: 0.75,
    }),
    "[推演笔记] MSFT 1d 20260425 盈亏比2.50 胜率75%",
  );
});

test("seed meta has one template for each canonical note type", () => {
  assert.equal(buildReplayNoteSeedMeta("FREE_REPLAY").templateId, "note.free-replay.v1");
  assert.equal(buildReplayNoteSeedMeta("CHALLENGE").templateId, "note.challenge.v1");
  assert.equal(buildReplayNoteSeedMeta("CUSTOM").templateId, "note.custom.v1");
});

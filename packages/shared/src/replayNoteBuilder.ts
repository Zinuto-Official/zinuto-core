// SPDX-License-Identifier: GPL-3.0-only

import {
  formatMessage,
  loadLocaleCatalog,
  type MessageId,
} from "@zinuto/shared/i18n";
import { toMarketDateKey } from "./marketTime.js";
import {
  createEmptyReplayNoteDocument,
  type ReplayNoteDocumentV1,
} from "./replayNoteDocument.js";
import {
  REPLAY_NOTE_TYPES,
  isReplayNoteType,
  type ReplayNoteType,
} from "./replayNoteTypes.js";

export type ReplayNoteBuilderLanguage =
  | "zh-CN"
  | "en"
  | "ko"
  | "ja"
  | "es";

export type ReplayNoteBuilderType = ReplayNoteType;

export { REPLAY_NOTE_TYPES, isReplayNoteType, type ReplayNoteType };

export type ReplayNoteBuilderStructuredMeta = {
  schemaVersion: number;
  templateId: string;
  layout: "DASHBOARD_REPLAY_REFLECTION" | "DOCUMENT_ONLY";
  reflectionSections: Array<{ key: string; required?: boolean }>;
};

export type ReplayNoteBuilderSourceKind =
  | "TRAINING_PROJECT"
  | "SPECIAL_TRAINING_QUESTION"
  | "CUSTOM"
  | "UNKNOWN";

export type ReplayNoteBuilderSource = {
  kind: ReplayNoteBuilderSourceKind;
  id: string | null;
  label?: string;
};

export type ReplayNoteBuilderCopy = {
  symbol: string;
  period: string;
  scenario: string;
  trades: string;
  winRate: string;
  profitLossRatio: string;
  maxDrawdown: string;
  summary: string;
  reflection: string;
  trainingRecord: string;
  historyReview: string;
  customNote: string;
};

type ReplayNoteReflectionSectionMessage = {
  label?: unknown;
};

type ReplayNoteDefaultTitleContext = {
  language: ReplayNoteBuilderLanguage;
  noteType: ReplayNoteBuilderType;
  createdAt?: string | null;
  symbol?: string | null;
  displayPeriod?: string | null;
  baseTimeframe?: string | null;
  profitLossRatio?: number | string | null;
  winRate?: number | null;
  advantageRatio?: number | string | null;
  grade?: string | null;
  recoveryRate?: number | null;
};

const TEMPLATE_BY_TYPE: Record<
  ReplayNoteBuilderType,
  ReplayNoteBuilderStructuredMeta
> = Object.freeze({
  FREE_REPLAY: {
    schemaVersion: 1,
    templateId: "note.free-replay.v1",
    layout: "DASHBOARD_REPLAY_REFLECTION",
    reflectionSections: [
      { key: "marketFacts", required: true },
      { key: "executionAssessment", required: true },
      { key: "nextAction", required: true },
      { key: "emotionState", required: false },
    ],
  },
  CHALLENGE: {
    schemaVersion: 1,
    templateId: "note.challenge.v1",
    layout: "DASHBOARD_REPLAY_REFLECTION",
    reflectionSections: [
      { key: "speedAssessment", required: true },
      { key: "instinctCheck", required: false },
      { key: "riskReflection", required: false },
      { key: "recoveryAction", required: false },
    ],
  },
  CUSTOM: {
    schemaVersion: 1,
    templateId: "note.custom.v1",
    layout: "DOCUMENT_ONLY",
    reflectionSections: [],
  },
});

const replayNoteMessageId = (key: string): MessageId =>
  `appText.replayNote.${key}` as MessageId;

const formatReplayNoteMessage = (
  language: ReplayNoteBuilderLanguage,
  key: string,
): string => formatMessage(language, replayNoteMessageId(key));

export const resolveReplayNoteReflectionSectionLabel = (
  language: ReplayNoteBuilderLanguage,
  sectionKey: string,
): string => {
  const normalizedKey = String(sectionKey ?? "").trim();
  if (!normalizedKey) {
    return "";
  }
  try {
    const catalog = loadLocaleCatalog(language, "uiConfig") as Readonly<
      Record<string, string>
    >;
    const bundle = JSON.parse(
      String(catalog["replayNote.reflectionSection.bundle"] ?? ""),
    ) as Record<string, ReplayNoteReflectionSectionMessage>;
    const label = String(bundle?.[normalizedKey]?.label ?? "").trim();
    return label || normalizedKey;
  } catch {
    return normalizedKey;
  }
};

const formatReplayNoteDateToken = (value?: string | null): string => {
  const dateKey = value ? toMarketDateKey(value) : "";
  return dateKey ? dateKey.replace(/-/g, "") : "";
};

const formatReplayNoteRatioToken = (
  value: number | string | null | undefined,
): string => {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "";
  }
  if (Math.abs(value) >= 10) {
    return value.toFixed(1);
  }
  return value.toFixed(2);
};

const formatReplayNotePercentToken = (
  value: number | null | undefined,
): string => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "";
  }
  return `${Math.round(value * 100)}%`;
};

export const resolveReplayNoteSemanticLabel = (
  language: ReplayNoteBuilderLanguage,
  noteType: ReplayNoteBuilderType,
): string =>
  formatReplayNoteMessage(language, `semantic.${noteType}`);

export const buildReplayNoteSeedMeta = (
  noteType: ReplayNoteBuilderType,
): ReplayNoteBuilderStructuredMeta => {
  const template = TEMPLATE_BY_TYPE[noteType];
  return {
    schemaVersion: template.schemaVersion,
    templateId: template.templateId,
    layout: template.layout,
    reflectionSections: template.reflectionSections.map((section) => ({
      key: section.key,
      required: Boolean(section.required),
    })),
  };
};

export const buildReplayNoteSeedContent = (
  _noteType: ReplayNoteBuilderType,
  _language: ReplayNoteBuilderLanguage,
): ReplayNoteDocumentV1 => createEmptyReplayNoteDocument();

export const buildReplayNoteSourceForCreate = (params: {
  noteType: ReplayNoteBuilderType;
  trainingProjectId?: string | null;
  contextSessionId?: string | null;
  symbol?: string | null;
}): ReplayNoteBuilderSource => {
  const trainingProjectId = String(params.trainingProjectId ?? "").trim();
  const contextSessionId = String(params.contextSessionId ?? "").trim();
  const symbol = String(params.symbol ?? "").trim();
  if (params.noteType === "CUSTOM") {
    return {
      kind: "CUSTOM",
      id: null,
      label: undefined,
    };
  }
  if (params.noteType === "CHALLENGE") {
    return {
      kind: "SPECIAL_TRAINING_QUESTION",
      id: contextSessionId || trainingProjectId || null,
      label: symbol || undefined,
    };
  }
  return {
    kind: "TRAINING_PROJECT",
    id: trainingProjectId || contextSessionId || null,
    label: symbol || undefined,
  };
};

export const buildReplayNoteDefaultTitle = (
  context: ReplayNoteDefaultTitleContext,
): string => {
  const semanticLabel = resolveReplayNoteSemanticLabel(
    context.language,
    context.noteType,
  );
  const prefix = `[${semanticLabel}]`;
  const symbol = String(context.symbol ?? "").trim().toUpperCase();
  const period = String(
    context.displayPeriod ?? context.baseTimeframe ?? "",
  ).trim();
  const date = formatReplayNoteDateToken(context.createdAt);
  const metrics = [
    context.noteType === "FREE_REPLAY" && context.profitLossRatio !== null
      ? `${formatReplayNoteMessage(context.language, "titleMetric.profitLossRatio")}${formatReplayNoteRatioToken(context.profitLossRatio)}`
      : "",
    context.noteType === "FREE_REPLAY" && context.winRate !== null
      ? `${formatReplayNoteMessage(context.language, "titleMetric.winRate")}${formatReplayNotePercentToken(context.winRate)}`
      : "",
    context.noteType === "CHALLENGE" && context.advantageRatio !== null
      ? `${formatReplayNoteMessage(context.language, "titleMetric.advantageRatio")}${formatReplayNoteRatioToken(context.advantageRatio)}`
      : "",
    context.noteType === "CHALLENGE" && context.grade
      ? `${formatReplayNoteMessage(context.language, "titleMetric.grade")}${String(context.grade).trim()}`
      : "",
    context.noteType === "CHALLENGE" && context.recoveryRate !== null
      ? `${formatReplayNoteMessage(context.language, "titleMetric.recoveryRate")}${formatReplayNotePercentToken(context.recoveryRate)}`
      : "",
  ].filter(Boolean);

  return [prefix, symbol, period, date, ...metrics].filter(Boolean).join(" ");
};

export const getReplayNoteBuilderCopy = (
  language: ReplayNoteBuilderLanguage,
): ReplayNoteBuilderCopy => {
  const copyKeys: Record<keyof ReplayNoteBuilderCopy, string> = {
    symbol: "builder.symbol",
    period: "builder.period",
    scenario: "builder.scenario",
    trades: "builder.trades",
    winRate: "builder.winRate",
    profitLossRatio: "builder.profitLossRatio",
    maxDrawdown: "builder.maxDrawdown",
    summary: "builder.summary",
    reflection: "builder.reflection",
    trainingRecord: "builder.trainingRecord",
    historyReview: "builder.historyReview",
    customNote: "builder.customNote",
  };
  return Object.fromEntries(
    Object.entries(copyKeys).map(([field, key]) => [
      field,
      formatReplayNoteMessage(language, key),
    ]),
  ) as ReplayNoteBuilderCopy;
};

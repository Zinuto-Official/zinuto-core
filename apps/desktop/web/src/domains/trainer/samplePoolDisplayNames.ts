// SPDX-License-Identifier: GPL-3.0-only

import { formatMessage, type MessageId, type SupportedLocale } from "@zinuto/shared/i18n";
import {
  SAMPLE_POOL_SYSTEM_FX_1M_2025Q1_ID,
  SAMPLE_POOL_SYSTEM_ID,
} from "@/domains/trainer/samplePools";

type BuiltInSamplePoolDisplayMessageId =
  | "appText.nasdaqWikiEod100"
  | "appText.builtInFxDataset";

type BuiltInSamplePoolDisplayEntry = {
  poolId: string;
  messageId: BuiltInSamplePoolDisplayMessageId;
  aliases: readonly string[];
};

const normalizeDisplayAlias = (value: unknown): string =>
  String(value ?? "").trim().toLocaleLowerCase();

const BUILT_IN_SAMPLE_POOL_DISPLAY_ENTRIES: readonly BuiltInSamplePoolDisplayEntry[] = [
  {
    poolId: SAMPLE_POOL_SYSTEM_ID,
    messageId: "appText.nasdaqWikiEod100",
    aliases: [
      SAMPLE_POOL_SYSTEM_ID,
      "SYSTEM:1d",
      "SYSTEM_1D",
      "Nasdaq Data Link WIKI EOD 100",
      "Nasdaq Data Link WIKI EOD 100 数据集",
      "Nasdaq Data Link WIKI EOD 100 データセット",
      "Nasdaq Data Link WIKI EOD 100 데이터셋",
      "Conjunto Nasdaq Data Link WIKI EOD 100",
      "WIKI EOD 100",
      "内置 WIKI EOD 100",
      "Built-in WIKI EOD 100",
      "美股日线内置样本池",
      "Built-in US Stocks Daily Sample Pool",
      "米国株日足内蔵サンプルプール",
      "미국 주식 일봉 내장 샘플 풀",
      "Pool de muestras incluido de acciones de EE. UU. (diario)",
    ],
  },
  {
    poolId: SAMPLE_POOL_SYSTEM_FX_1M_2025Q1_ID,
    messageId: "appText.builtInFxDataset",
    aliases: [
      SAMPLE_POOL_SYSTEM_FX_1M_2025Q1_ID,
      "SYSTEM:1m",
      "SYSTEM_1M",
      "HistData FX 1m 2025 Q1",
      "FX 内置数据集",
      "Built-in FX Dataset",
      "FX 内蔵データセット",
      "FX 내장 데이터셋",
      "Conjunto FX integrado",
      "FX samples",
      "FX サンプル",
      "外汇1分钟内置样本池",
      "Built-in FX 1m Sample Pool",
      "FX 1分足内蔵サンプルプール",
      "FX 1분 내장 샘플 풀",
      "Pool de muestras incluido de FX (1 min)",
    ],
  },
];

const BUILT_IN_SAMPLE_POOL_DISPLAY_ENTRY_BY_POOL_ID = new Map(
  BUILT_IN_SAMPLE_POOL_DISPLAY_ENTRIES.map((entry) => [
    normalizeDisplayAlias(entry.poolId),
    entry,
  ]),
);

const BUILT_IN_SAMPLE_POOL_DISPLAY_MESSAGE_ID_BY_ALIAS = new Map<string, BuiltInSamplePoolDisplayMessageId>();
const BUILT_IN_SAMPLE_POOL_DISPLAY_ALIASES_BY_MESSAGE_ID = new Map<
  BuiltInSamplePoolDisplayMessageId,
  Set<string>
>();

BUILT_IN_SAMPLE_POOL_DISPLAY_ENTRIES.forEach((entry) => {
  const aliasSet = BUILT_IN_SAMPLE_POOL_DISPLAY_ALIASES_BY_MESSAGE_ID.get(entry.messageId) ?? new Set<string>();
  [entry.poolId, ...entry.aliases].forEach((alias) => {
    const normalizedAlias = normalizeDisplayAlias(alias);
    if (!normalizedAlias) {
      return;
    }
    BUILT_IN_SAMPLE_POOL_DISPLAY_MESSAGE_ID_BY_ALIAS.set(normalizedAlias, entry.messageId);
    aliasSet.add(normalizedAlias);
  });
  BUILT_IN_SAMPLE_POOL_DISPLAY_ALIASES_BY_MESSAGE_ID.set(entry.messageId, aliasSet);
});

export const resolveBuiltInSamplePoolDisplayMessageId = (
  poolId: string,
  fallbackName = "",
): BuiltInSamplePoolDisplayMessageId | null => {
  const normalizedPoolId = normalizeDisplayAlias(poolId);
  const directEntry = BUILT_IN_SAMPLE_POOL_DISPLAY_ENTRY_BY_POOL_ID.get(normalizedPoolId);
  if (directEntry) {
    return directEntry.messageId;
  }
  return (
    BUILT_IN_SAMPLE_POOL_DISPLAY_MESSAGE_ID_BY_ALIAS.get(normalizedPoolId) ??
    BUILT_IN_SAMPLE_POOL_DISPLAY_MESSAGE_ID_BY_ALIAS.get(normalizeDisplayAlias(fallbackName)) ??
    null
  );
};

export const formatBuiltInSamplePoolDisplayName = (
  language: SupportedLocale | string,
  poolId: string,
  fallbackName = "",
): string => {
  const messageId = resolveBuiltInSamplePoolDisplayMessageId(poolId, fallbackName);
  return messageId ? formatMessage(language, messageId as MessageId) : "";
};

export const isBuiltInSamplePoolDefaultDisplayAlias = (
  poolId: string,
  value: unknown,
): boolean => {
  const normalizedValue = normalizeDisplayAlias(value);
  if (!normalizedValue) {
    return false;
  }
  const messageId =
    BUILT_IN_SAMPLE_POOL_DISPLAY_ENTRY_BY_POOL_ID.get(normalizeDisplayAlias(poolId))?.messageId ??
    resolveBuiltInSamplePoolDisplayMessageId(poolId);
  if (!messageId) {
    return false;
  }
  return BUILT_IN_SAMPLE_POOL_DISPLAY_ALIASES_BY_MESSAGE_ID
    .get(messageId)
    ?.has(normalizedValue) === true;
};

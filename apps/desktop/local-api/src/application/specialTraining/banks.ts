// SPDX-License-Identifier: GPL-3.0-only

import { createHash } from "node:crypto";
import {
  resolveSystemSeedPoolBaseTimeframe,
  SYSTEM_FX_1M_2025Q1_POOL_ID,
  SYSTEM_WIKI_EOD_POOL_ID,
} from "../ports/infrastructure/db/systemSeedBars.js";
import { INPUT_LIMITS } from "@zinuto/shared/input-limits";
import { appError } from "../../kernel/appError.js";
import { createId } from "../../kernel/id.js";
import { nowIso } from "../../kernel/time.js";
import type {
  CreateSpecialTrainingBankPayload,
  ListSpecialTrainingBanksPayload,
  ListSpecialTrainingBanksResult,
  SpecialTrainingAssetClass,
  SpecialTrainingBankScope,
  SpecialTrainingBankScopeSummary,
  SpecialTrainingBankSummary,
  UpdateSpecialTrainingBankPayload,
} from "../../domain/specialTraining/contracts.js";
import {
  compareSpecialTrainingBaseTimeframe,
  normalizeSpecialTrainingBaseTimeframe,
  type SpecialTrainingBaseTimeframe,
} from "../../domain/specialTraining/timeframeSemantics.js";
import {
  countSpecialTrainingBankRows,
  deleteSpecialTrainingBankRow,
  getSpecialTrainingBankRowById,
  insertSpecialTrainingBankRow,
  listDefaultSpecialTrainingQuestionBankSeedRows as listDefaultSpecialTrainingQuestionBankSeedRowsFromStore,
  listLocalDataSourceIds,
  listLocalPoolScopedInstrumentRows as listLocalPoolScopedInstrumentRowsFromStore,
  listSpecialTrainingBankPageRows,
  listSpecialTrainingBankRows,
  listSystemPoolScopedInstrumentRowsByTimeframe,
  readAppMetaValue,
  runSpecialTrainingBankMutation,
  updateSpecialTrainingBankRow,
  writeAppMetaValue,
  type SpecialTrainingBankInstrumentRow,
  type SpecialTrainingBankRow,
} from "../ports/infrastructure/db/specialTraining/banksStore.js";

const normalizeBankAssetClass = (
  value: unknown,
): SpecialTrainingAssetClass | null => {
  if (
    value === "STOCK" ||
    value === "FUTURES" ||
    value === "FOREX" ||
    value === "CRYPTO"
  ) {
    return value;
  }
  return null;
};

const normalizePoolIds = (poolIds: string[]): string[] =>
  Array.from(
    new Set(
      poolIds
        .map((poolId) => String(poolId || "").trim())
        .filter((poolId) => poolId.length > 0),
    ),
  ).sort((left, right) => left.localeCompare(right, "en"));

export const DEFAULT_SPECIAL_TRAINING_QUESTION_BANK_NAME = "默认1D题库";
export const DEFAULT_SPECIAL_TRAINING_QUESTION_BANK_SEED_VERSION =
  "2026-05-11-v1-default-1d-question-bank";
export const DEFAULT_SPECIAL_TRAINING_QUESTION_BANK_POOL_IDS = normalizePoolIds([
  SYSTEM_WIKI_EOD_POOL_ID,
  SYSTEM_FX_1M_2025Q1_POOL_ID,
]);

const DEFAULT_SPECIAL_TRAINING_QUESTION_BANK_SEED_META_KEY =
  "special_training_default_question_bank_seed_version";
const SPECIAL_TRAINING_BANK_LIST_DEFAULT_LIMIT = 30;
const SPECIAL_TRAINING_BANK_LIST_MAX_LIMIT = 100;

type SpecialTrainingBankListCursor = {
  updatedAt: string;
  createdAt: string;
  id: string;
};

type BankScopeSummaryCache = Map<string, SpecialTrainingBankScopeSummary>;

const resolveSystemSpecialTrainingPoolTimeframe = (
  poolId: string,
): SpecialTrainingBaseTimeframe | null =>
  normalizeSpecialTrainingBaseTimeframe(
    resolveSystemSeedPoolBaseTimeframe(poolId),
  );

const isSystemSpecialTrainingPoolId = (poolId: string): boolean =>
  Boolean(resolveSystemSpecialTrainingPoolTimeframe(poolId));

const resolveSupportedPoolIds = (
  poolIds: string[],
): Set<string> => {
  const normalizedPoolIds = normalizePoolIds(poolIds);
  if (!normalizedPoolIds.length) {
    return new Set();
  }
  const supportedPoolIds = new Set(
    normalizedPoolIds.filter((poolId) => isSystemSpecialTrainingPoolId(poolId)),
  );
  const localPoolIds = normalizedPoolIds.filter(
    (poolId) => !supportedPoolIds.has(poolId),
  );
  if (!localPoolIds.length) {
    return supportedPoolIds;
  }
  listLocalDataSourceIds(localPoolIds).forEach((poolId) => {
    supportedPoolIds.add(poolId);
  });
  return supportedPoolIds;
};

const splitPoolIdsByOrigin = (
  poolIds: string[],
): {
  localPoolIds: string[];
  systemPoolIds: string[];
} => {
  const normalizedPoolIds = normalizePoolIds(poolIds);
  return {
    localPoolIds: normalizedPoolIds.filter(
      (poolId) => !isSystemSpecialTrainingPoolId(poolId),
    ),
    systemPoolIds: normalizedPoolIds.filter((poolId) =>
      isSystemSpecialTrainingPoolId(poolId),
    ),
  };
};

const listLocalPoolScopedInstrumentRows = (
  poolIds: string[],
): SpecialTrainingBankInstrumentRow[] => {
  const normalizedPoolIds = normalizePoolIds(poolIds);
  if (!normalizedPoolIds.length) {
    return [];
  }
  return listLocalPoolScopedInstrumentRowsFromStore(normalizedPoolIds);
};

const listSystemPoolScopedInstrumentRows = (
  poolIds: string[],
): SpecialTrainingBankInstrumentRow[] => {
  const normalizedTimeframes = Array.from(
    new Set(
      poolIds
        .map((poolId) => resolveSystemSpecialTrainingPoolTimeframe(poolId))
        .filter((timeframe): timeframe is SpecialTrainingBaseTimeframe =>
          Boolean(timeframe),
        ),
    ),
  );
  if (!normalizedTimeframes.length) {
    return [];
  }
  return listSystemPoolScopedInstrumentRowsByTimeframe(normalizedTimeframes);
};

const dedupeInstrumentRows = (
  rows: SpecialTrainingBankInstrumentRow[],
): SpecialTrainingBankInstrumentRow[] =>
  Array.from(
    new Map(
      rows.map((row) => [String(row.id ?? "").trim(), row] as const),
    ).values(),
  );

const validatePoolScope = (
  poolIds: string[],
): string[] => {
  const normalizedPoolIds = normalizePoolIds(poolIds);
  if (!normalizedPoolIds.length) {
    throw appError("SPECIAL_TRAINING_BANK_SCOPE_REQUIRED");
  }
  const supportedPoolIds = resolveSupportedPoolIds(normalizedPoolIds);
  if (supportedPoolIds.size !== normalizedPoolIds.length) {
    throw appError("SPECIAL_TRAINING_BANK_SCOPE_REQUIRED");
  }
  return normalizedPoolIds;
};

const parseBankScope = (raw: unknown): SpecialTrainingBankScope => {
  try {
    const parsed = JSON.parse(String(raw ?? "{}")) as { poolIds?: unknown };
    return {
      poolIds: normalizePoolIds(
        Array.isArray(parsed?.poolIds)
          ? parsed.poolIds.map((item) => String(item || ""))
          : [],
      ),
    };
  } catch {
    return { poolIds: [] };
  }
};

const hashSpecialTrainingBankDefinition = (parts: string[]): string =>
  createHash("sha256").update(parts.join("|")).digest("hex");

const encodeBankListCursor = (row: SpecialTrainingBankRow): string | null => {
  const updatedAt = String(row.updated_at ?? "").trim();
  const createdAt = String(row.created_at ?? "").trim();
  const id = String(row.id ?? "").trim();
  if (!updatedAt || !createdAt || !id) {
    return null;
  }
  return Buffer.from(
    JSON.stringify({ updatedAt, createdAt, id }),
    "utf-8",
  ).toString("base64");
};

const decodeBankListCursor = (
  rawCursor?: string,
): SpecialTrainingBankListCursor | null => {
  const cursor = String(rawCursor ?? "").trim();
  if (!cursor) {
    return null;
  }
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64").toString("utf-8"),
    ) as {
      updatedAt?: unknown;
      createdAt?: unknown;
      id?: unknown;
    };
    const updatedAt = String(parsed.updatedAt ?? "").trim();
    const createdAt = String(parsed.createdAt ?? "").trim();
    const id = String(parsed.id ?? "").trim();
    if (!updatedAt || !createdAt || !id) {
      return null;
    }
    return { updatedAt, createdAt, id };
  } catch {
    return null;
  }
};

const resolveBankScopeSummaryCacheKey = (
  targetTimeframe: SpecialTrainingBaseTimeframe,
  poolIds: string[],
): string => `${targetTimeframe}\n${normalizePoolIds(poolIds).join("\n")}`;

const resolveCachedBankScopeSummary = (
  cache: BankScopeSummaryCache | undefined,
  targetTimeframe: SpecialTrainingBaseTimeframe,
  poolIds: string[],
): SpecialTrainingBankScopeSummary => {
  if (!cache) {
    return resolveSpecialTrainingBankScopeSummary({
      targetTimeframe,
      poolIds,
    });
  }
  const cacheKey = resolveBankScopeSummaryCacheKey(targetTimeframe, poolIds);
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const summary = resolveSpecialTrainingBankScopeSummary({
    targetTimeframe,
    poolIds,
  });
  cache.set(cacheKey, summary);
  return summary;
};

const SPECIAL_TRAINING_BANK_SCOPE_BLOCKED_REASON_MESSAGES = {
  POOL_SELECTION_REQUIRED: 'Select at least one sample pool.',
  POOL_REPAIR_REQUIRED: 'One or more selected sample pools need repair.',
  SYMBOLS_REQUIRED: 'Selected sample pools do not contain usable symbols.',
  TARGET_TIMEFRAME_INVALID:
    'Question bank target timeframe is below the selected sample pool timeframe.',
} as const;

export const resolveSpecialTrainingBankScopeSummary = (input: {
  targetTimeframe: SpecialTrainingBaseTimeframe;
  poolIds: string[];
}): SpecialTrainingBankScopeSummary => {
  const poolIds = normalizePoolIds(input.poolIds);
  const supportedPoolIds = resolveSupportedPoolIds(poolIds);
  const missingPoolIds = poolIds.filter((poolId) => !supportedPoolIds.has(poolId));
  const supportedPoolIdList = poolIds.filter((poolId) =>
    supportedPoolIds.has(poolId),
  );
  const { localPoolIds, systemPoolIds } = splitPoolIdsByOrigin(
    supportedPoolIdList,
  );
  const rows = dedupeInstrumentRows([
    ...listLocalPoolScopedInstrumentRows(localPoolIds),
    ...listSystemPoolScopedInstrumentRows(systemPoolIds),
  ]);
  const activeRows = rows.flatMap((row) => {
    const instrumentId = String(row.id ?? "").trim();
    const symbol = String(row.symbol ?? "")
      .trim()
      .toUpperCase();
    const sourceTimeframe = normalizeSpecialTrainingBaseTimeframe(
      row.baseTimeframe,
    );
    const barCount = Math.max(0, Math.floor(Number(row.barCount) || 0));
    if (!instrumentId || !symbol || !sourceTimeframe || barCount <= 0) {
      return [];
    }
    return [
      {
        instrumentId,
        symbol,
        sourceTimeframe,
        barCount,
        barsVersionToken: String(row.barsVersionToken ?? "").trim(),
      },
    ];
  });
  const sourceTimeframes = Array.from(
    new Set(activeRows.map((row) => row.sourceTimeframe)),
  ).sort((left, right) => compareSpecialTrainingBaseTimeframe(left, right));
  const maxSourceTimeframe = sourceTimeframes.at(-1) ?? null;
  const instrumentCount = new Set(
    activeRows.map((row) => row.instrumentId),
  ).size;
  const symbolCount = new Set(activeRows.map((row) => row.symbol)).size;
  const status: SpecialTrainingBankScopeSummary["status"] =
    missingPoolIds.length > 0
      ? "REPAIR_REQUIRED"
      : !poolIds.length || !activeRows.length
        ? "EMPTY"
        : maxSourceTimeframe &&
            compareSpecialTrainingBaseTimeframe(
              input.targetTimeframe,
              maxSourceTimeframe,
            ) < 0
          ? "TARGET_TIMEFRAME_INVALID"
          : "READY";
  const scopeBlockedReasonCode =
    !poolIds.length
      ? 'POOL_SELECTION_REQUIRED'
      : missingPoolIds.length > 0
        ? 'POOL_REPAIR_REQUIRED'
        : !activeRows.length
          ? 'SYMBOLS_REQUIRED'
          : null;
  const targetTimeframeBlockedReasonCode =
    status === 'TARGET_TIMEFRAME_INVALID'
      ? 'TARGET_TIMEFRAME_INVALID'
      : null;
  const readinessBlockedReasonCode =
    scopeBlockedReasonCode ?? targetTimeframeBlockedReasonCode;
  const definitionHash = hashSpecialTrainingBankDefinition([
    "special-training-bank-definition-v1",
    `target:${input.targetTimeframe}`,
    `pools:${poolIds.join(",")}`,
    `missing:${missingPoolIds.join(",")}`,
    ...activeRows
      .map(
        (row) =>
          `${row.instrumentId}:${row.symbol}:${row.sourceTimeframe}:${row.barCount}:${row.barsVersionToken}`,
      )
      .sort((left, right) => left.localeCompare(right, "en")),
  ]);

  return {
    status,
    poolCount: poolIds.length,
    instrumentCount,
    symbolCount,
    sourceTimeframes,
    definitionHash,
    missingPoolIds,
    maxSourceTimeframe,
    validation: {
      scope: {
        valid: scopeBlockedReasonCode === null,
        blockedReasonCode: scopeBlockedReasonCode,
        blockedReason:
          scopeBlockedReasonCode === null
            ? null
            : SPECIAL_TRAINING_BANK_SCOPE_BLOCKED_REASON_MESSAGES[
                scopeBlockedReasonCode
              ],
      },
      targetTimeframe: {
        valid: targetTimeframeBlockedReasonCode === null,
        blockedReasonCode: targetTimeframeBlockedReasonCode,
        blockedReason:
          targetTimeframeBlockedReasonCode === null
            ? null
            : SPECIAL_TRAINING_BANK_SCOPE_BLOCKED_REASON_MESSAGES[
                targetTimeframeBlockedReasonCode
              ],
      },
    },
    readiness: {
      canUse: readinessBlockedReasonCode === null,
      blockedReasonCode: readinessBlockedReasonCode,
      blockedReason:
        readinessBlockedReasonCode === null
          ? null
          : SPECIAL_TRAINING_BANK_SCOPE_BLOCKED_REASON_MESSAGES[
              readinessBlockedReasonCode
            ],
    },
  };
};

const toBankSummary = (
  row: SpecialTrainingBankRow,
  scopeSummaryCache?: BankScopeSummaryCache,
): SpecialTrainingBankSummary => {
  const bankId = String(row.id ?? "").trim();
  const name = String(row.name ?? "").trim();
  const assetClass = normalizeBankAssetClass(row.asset_class) ?? "STOCK";
  const targetTimeframe =
    normalizeSpecialTrainingBaseTimeframe(row.target_timeframe) ?? "1d";
  const scope = parseBankScope(row.scope_json);
  return {
    id: bankId,
    name,
    assetClass,
    targetTimeframe,
    scope,
    scopeSummary: resolveCachedBankScopeSummary(
      scopeSummaryCache,
      targetTimeframe,
      scope.poolIds,
    ),
    simulationBatchId: String(row.simulation_batch_id ?? "").trim() || null,
    createdAt: String(row.created_at ?? "").trim(),
    updatedAt: String(row.updated_at ?? "").trim(),
  };
};

const isDefaultSpecialTrainingQuestionBankRow = (
  row: SpecialTrainingBankRow,
): boolean => {
  const poolIds = parseBankScope(row.scope_json).poolIds;
  return (
    String(row.name ?? "").trim() ===
      DEFAULT_SPECIAL_TRAINING_QUESTION_BANK_NAME &&
    normalizeBankAssetClass(row.asset_class) === "STOCK" &&
    normalizeSpecialTrainingBaseTimeframe(row.target_timeframe) === "1d" &&
    String(row.simulation_batch_id ?? "").trim() === "" &&
    poolIds.length === DEFAULT_SPECIAL_TRAINING_QUESTION_BANK_POOL_IDS.length &&
    poolIds.every(
      (poolId, index) =>
        poolId === DEFAULT_SPECIAL_TRAINING_QUESTION_BANK_POOL_IDS[index],
    )
  );
};

const listDefaultSpecialTrainingQuestionBankSeedRows =
  (): SpecialTrainingBankRow[] =>
    listDefaultSpecialTrainingQuestionBankSeedRowsFromStore(
      DEFAULT_SPECIAL_TRAINING_QUESTION_BANK_NAME,
    ).filter(isDefaultSpecialTrainingQuestionBankRow);

export const countDefaultSpecialTrainingQuestionBankSeeds = (): number =>
  listDefaultSpecialTrainingQuestionBankSeedRows().length;

const readDefaultSpecialTrainingQuestionBankSeedVersion = (): string =>
  readAppMetaValue(DEFAULT_SPECIAL_TRAINING_QUESTION_BANK_SEED_META_KEY);

const markDefaultSpecialTrainingQuestionBankSeeded = (
  timestamp: string,
): void => {
  writeAppMetaValue({
    key: DEFAULT_SPECIAL_TRAINING_QUESTION_BANK_SEED_META_KEY,
    value: DEFAULT_SPECIAL_TRAINING_QUESTION_BANK_SEED_VERSION,
    updatedAt: timestamp,
  });
};

const listPoolScopedInstrumentRows = (
  poolIds: string[],
): Array<{
  id?: unknown;
  baseTimeframe?: unknown;
  barCount?: unknown;
}> => {
  const normalizedPoolIds = normalizePoolIds(poolIds);
  const supportedPoolIds = resolveSupportedPoolIds(normalizedPoolIds);
  if (
    !normalizedPoolIds.length ||
    supportedPoolIds.size !== normalizedPoolIds.length
  ) {
    return [];
  }
  const { localPoolIds, systemPoolIds } = splitPoolIdsByOrigin(
    normalizedPoolIds,
  );
  return dedupeInstrumentRows([
    ...listLocalPoolScopedInstrumentRows(localPoolIds),
    ...listSystemPoolScopedInstrumentRows(systemPoolIds),
  ]);
};

export const listSpecialTrainingInstrumentIdsByPoolScope = (
  poolIds: string[],
): string[] =>
  Array.from(
    new Set(
      listPoolScopedInstrumentRows(poolIds)
        .map((row) => String(row.id ?? "").trim())
        .filter((instrumentId) => instrumentId.length > 0),
    ),
  );

const listPoolScopeInstrumentBaseTimeframes = (
  poolIds: string[],
): SpecialTrainingBaseTimeframe[] =>
  listPoolScopedInstrumentRows(poolIds)
    .flatMap((row) => {
      const baseTimeframe = normalizeSpecialTrainingBaseTimeframe(
        row.baseTimeframe,
      );
      const barCount = Math.max(0, Math.floor(Number(row.barCount) || 0));
      if (!baseTimeframe || barCount <= 0) {
        return [];
      }
      return [baseTimeframe];
    })
    .sort((left, right) => compareSpecialTrainingBaseTimeframe(left, right));

const validateSpecialTrainingBankPayload = (
  payload: CreateSpecialTrainingBankPayload | UpdateSpecialTrainingBankPayload,
): {
  name: string;
  assetClass: SpecialTrainingAssetClass;
  targetTimeframe: SpecialTrainingBaseTimeframe;
  scope: SpecialTrainingBankScope;
  simulationBatchId: string | null;
} => {
  const name = String(payload.name || "").trim();
  if (!name) {
    throw appError("SPECIAL_TRAINING_BANK_NAME_REQUIRED");
  }
  if (name.length > INPUT_LIMITS.specialTrainingBankNameChars) {
    throw appError("SPECIAL_TRAINING_BANK_NAME_TOO_LONG", {
      max: INPUT_LIMITS.specialTrainingBankNameChars,
    });
  }
  const assetClass = normalizeBankAssetClass(payload.assetClass);
  if (!assetClass) {
    throw appError("SPECIAL_TRAINING_BANK_ASSET_CLASS_INVALID");
  }
  const targetTimeframe = normalizeSpecialTrainingBaseTimeframe(
    payload.targetTimeframe,
  );
  if (!targetTimeframe) {
    throw appError("SPECIAL_TRAINING_BANK_TARGET_TIMEFRAME_INVALID");
  }
  const poolIds = validatePoolScope(payload.poolIds);
  const sourceTimeframes = listPoolScopeInstrumentBaseTimeframes(poolIds);
  if (!sourceTimeframes.length) {
    throw appError("SPECIAL_TRAINING_SYMBOLS_NO_DATA");
  }
  const maxSourceTimeframe =
    sourceTimeframes[sourceTimeframes.length - 1] ?? targetTimeframe;
  if (
    compareSpecialTrainingBaseTimeframe(targetTimeframe, maxSourceTimeframe) < 0
  ) {
    throw appError("SPECIAL_TRAINING_BANK_TARGET_TIMEFRAME_INVALID", {
      targetTimeframe,
      maxSourceTimeframe,
    });
  }
  return {
    name,
    assetClass,
    targetTimeframe,
    scope: {
      poolIds,
    },
    simulationBatchId: String(payload.simulationBatchId ?? "").trim() || null,
  };
};

export const validateSpecialTrainingBankDraft = (payload: {
  assetClass: SpecialTrainingAssetClass;
  targetTimeframe: SpecialTrainingBaseTimeframe;
  poolIds: string[];
}): {
  assetClass: SpecialTrainingAssetClass;
  targetTimeframe: SpecialTrainingBaseTimeframe;
  scope: SpecialTrainingBankScope;
} => {
  const assetClass = normalizeBankAssetClass(payload.assetClass);
  if (!assetClass) {
    throw appError("SPECIAL_TRAINING_BANK_ASSET_CLASS_INVALID");
  }
  const targetTimeframe = normalizeSpecialTrainingBaseTimeframe(
    payload.targetTimeframe,
  );
  if (!targetTimeframe) {
    throw appError("SPECIAL_TRAINING_BANK_TARGET_TIMEFRAME_INVALID");
  }
  const poolIds = validatePoolScope(payload.poolIds);
  const sourceTimeframes = listPoolScopeInstrumentBaseTimeframes(poolIds);
  if (!sourceTimeframes.length) {
    throw appError("SPECIAL_TRAINING_SYMBOLS_NO_DATA");
  }
  const maxSourceTimeframe =
    sourceTimeframes[sourceTimeframes.length - 1] ?? targetTimeframe;
  if (
    compareSpecialTrainingBaseTimeframe(targetTimeframe, maxSourceTimeframe) < 0
  ) {
    throw appError("SPECIAL_TRAINING_BANK_TARGET_TIMEFRAME_INVALID", {
      targetTimeframe,
      maxSourceTimeframe,
    });
  }
  return {
    assetClass,
    targetTimeframe,
    scope: {
      poolIds,
    },
  };
};

export const ensureDefaultSpecialTrainingQuestionBankSeed = (
  options: { force?: boolean } = {},
): SpecialTrainingBankSummary | null => {
  const force = Boolean(options.force);
  const existingRows = listDefaultSpecialTrainingQuestionBankSeedRows();
  const existing = existingRows[0] ?? null;
  if (
    !force &&
    readDefaultSpecialTrainingQuestionBankSeedVersion() ===
      DEFAULT_SPECIAL_TRAINING_QUESTION_BANK_SEED_VERSION
  ) {
    return existing ? toBankSummary(existing) : null;
  }

  const validated = validateSpecialTrainingBankPayload({
    name: DEFAULT_SPECIAL_TRAINING_QUESTION_BANK_NAME,
    assetClass: "STOCK",
    targetTimeframe: "1d",
    poolIds: DEFAULT_SPECIAL_TRAINING_QUESTION_BANK_POOL_IDS,
  });

  const createdBankId = runSpecialTrainingBankMutation(() => {
    const current = listDefaultSpecialTrainingQuestionBankSeedRows()[0] ?? null;
    const seededAt = nowIso();
    if (current?.id) {
      markDefaultSpecialTrainingQuestionBankSeeded(seededAt);
      return String(current.id).trim();
    }

    const bankId = createId();
    insertSpecialTrainingBankRow({
      id: bankId,
      name: validated.name,
      assetClass: validated.assetClass,
      targetTimeframe: validated.targetTimeframe,
      scopeJson: JSON.stringify(validated.scope),
      simulationBatchId: validated.simulationBatchId,
      createdAt: seededAt,
      updatedAt: seededAt,
    });
    markDefaultSpecialTrainingQuestionBankSeeded(seededAt);
    return bankId;
  });

  return getSpecialTrainingBankById(createdBankId);
};

export const listSpecialTrainingBanks = (): SpecialTrainingBankSummary[] => {
  ensureDefaultSpecialTrainingQuestionBankSeed();
  const scopeSummaryCache: BankScopeSummaryCache = new Map();
  return listSpecialTrainingBankRows().map((row) =>
    toBankSummary(row, scopeSummaryCache),
  );
};

export const listSpecialTrainingBanksPage = (
  payload: ListSpecialTrainingBanksPayload = {},
): ListSpecialTrainingBanksResult => {
  ensureDefaultSpecialTrainingQuestionBankSeed();
  const rawLimit = Number(payload.limit);
  const normalizedLimit = Math.max(
    1,
    Math.min(
      SPECIAL_TRAINING_BANK_LIST_MAX_LIMIT,
      Math.floor(
        Number.isFinite(rawLimit)
          ? rawLimit
          : SPECIAL_TRAINING_BANK_LIST_DEFAULT_LIMIT,
      ),
    ),
  );
  const keyword = String(payload.keyword ?? "").trim();
  const cursor = decodeBankListCursor(payload.cursor);
  const total = countSpecialTrainingBankRows(keyword);
  const queryLimit = normalizedLimit + 1;
  const rows = listSpecialTrainingBankPageRows({
    keyword,
    cursor,
    limit: queryLimit,
  });
  const hasMore = rows.length > normalizedLimit;
  const pageRows = hasMore ? rows.slice(0, normalizedLimit) : rows;
  const scopeSummaryCache: BankScopeSummaryCache = new Map();
  const nextCursor = hasMore
    ? encodeBankListCursor(pageRows[pageRows.length - 1] ?? {})
    : null;

  return {
    items: pageRows.map((row) => toBankSummary(row, scopeSummaryCache)),
    nextCursor,
    total,
  };
};

export const getSpecialTrainingBankById = (
  bankIdRaw: string,
): SpecialTrainingBankSummary | null => {
  const bankId = String(bankIdRaw || "").trim();
  if (!bankId) {
    return null;
  }
  const row = getSpecialTrainingBankRowById(bankId);
  return row ? toBankSummary(row) : null;
};

export const createSpecialTrainingBank = (
  payload: CreateSpecialTrainingBankPayload,
): SpecialTrainingBankSummary => {
  const validated = validateSpecialTrainingBankPayload(payload);
  const createdAt = nowIso();
  const bankId = createId();
  insertSpecialTrainingBankRow({
    id: bankId,
    name: validated.name,
    assetClass: validated.assetClass,
    targetTimeframe: validated.targetTimeframe,
    scopeJson: JSON.stringify(validated.scope),
    simulationBatchId: validated.simulationBatchId,
    createdAt,
    updatedAt: createdAt,
  });
  return (
    getSpecialTrainingBankById(bankId) ?? {
      id: bankId,
      name: validated.name,
      assetClass: validated.assetClass,
      targetTimeframe: validated.targetTimeframe,
      scope: validated.scope,
      simulationBatchId: validated.simulationBatchId,
      scopeSummary: resolveSpecialTrainingBankScopeSummary({
        targetTimeframe: validated.targetTimeframe,
        poolIds: validated.scope.poolIds,
      }),
      createdAt,
      updatedAt: createdAt,
    }
  );
};

export const updateSpecialTrainingBank = (
  bankIdRaw: string,
  payload: UpdateSpecialTrainingBankPayload,
): SpecialTrainingBankSummary => {
  const bankId = String(bankIdRaw || "").trim();
  if (!bankId) {
    throw appError("SPECIAL_TRAINING_BANK_NOT_FOUND");
  }
  if (!getSpecialTrainingBankById(bankId)) {
    throw appError("SPECIAL_TRAINING_BANK_NOT_FOUND");
  }
  const validated = validateSpecialTrainingBankPayload(payload);
  const updatedAt = nowIso();
  updateSpecialTrainingBankRow({
    id: bankId,
    name: validated.name,
    assetClass: validated.assetClass,
    targetTimeframe: validated.targetTimeframe,
    scopeJson: JSON.stringify(validated.scope),
    updatedAt,
  });
  const updated = getSpecialTrainingBankById(bankId);
  if (!updated) {
    throw appError("SPECIAL_TRAINING_BANK_NOT_FOUND");
  }
  return updated;
};

export const deleteSpecialTrainingBank = (
  bankIdRaw: string,
): { bankId: string; deleted: boolean } => {
  const bankId = String(bankIdRaw || "").trim();
  if (!bankId) {
    throw appError("SPECIAL_TRAINING_BANK_NOT_FOUND");
  }
  const deleted = deleteSpecialTrainingBankRow(bankId);
  if (!deleted) {
    throw appError("SPECIAL_TRAINING_BANK_NOT_FOUND");
  }
  return {
    bankId,
    deleted,
  };
};

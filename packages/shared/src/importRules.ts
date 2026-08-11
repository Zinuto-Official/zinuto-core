// SPDX-License-Identifier: GPL-3.0-only

export type {
  ImportMarketPresetRule,
  ImportTimeZoneRuleEvidence,
  ImportTimeZoneRuleEvidenceCode,
  ImportTimeZoneRuleInput,
} from "./importTimeZoneRules.js";
export {
  IMPORT_MARKET_PRESET_RULES,
  inferImportTimeZoneRuleEvidence,
  resolveImportMarketPresetRule,
} from "./importTimeZoneRules.js";

export type ImportRuleFieldKey =
  "date" | "time" | "open" | "high" | "low" | "close" | "volume";

export type ImportRuleBaseFieldKey = Exclude<ImportRuleFieldKey, "time">;
export type ImportRuleRequiredFieldKey = Exclude<
  ImportRuleBaseFieldKey,
  "volume"
>;
export type ImportRuleTimestampMode = "SINGLE" | "SPLIT";
export type ImportRulePriceFamily = "RAW" | "ADJUSTED" | "GENERIC";
export type ImportRuleConfidence = "HIGH" | "MEDIUM" | "LOW";

export type ImportRuleFieldMapping = {
  timestampMode: ImportRuleTimestampMode;
  date: string;
  time: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
};

export type ImportRuleFieldCandidate = {
  field: ImportRuleFieldKey;
  header: string;
  normalizedHeader: string;
  score: number;
  reason: string;
  family: ImportRulePriceFamily;
};

export type ImportRuleFieldDiagnostic = {
  field: ImportRuleFieldKey;
  status: "MATCHED" | "MISSING" | "CONFLICT";
  selectedHeader: string;
  confidence: ImportRuleConfidence;
  reason: string;
  candidates: ImportRuleFieldCandidate[];
};

export type ImportRuleMappingProfile = {
  mapping: ImportRuleFieldMapping;
  canonicalSchemaKey: string;
  priceFamily: ImportRulePriceFamily;
  confidence: ImportRuleConfidence;
  score: number;
  isImportable: boolean;
  conflicts: string[];
  fieldDiagnostics: ImportRuleFieldDiagnostic[];
};

export const IMPORT_REQUIRED_FIELDS: ImportRuleRequiredFieldKey[] = [
  "date",
  "open",
  "high",
  "low",
  "close",
];

export const IMPORT_FIELD_RENDER_ORDER: ImportRuleBaseFieldKey[] = [
  "date",
  "open",
  "close",
  "high",
  "low",
  "volume",
];

export const IMPORT_SPLIT_FIELD_RENDER_ORDER: ImportRuleFieldKey[] = [
  "date",
  "time",
  "open",
  "close",
  "high",
  "low",
  "volume",
];

export const DEFAULT_IMPORT_FIELD_MAPPING: ImportRuleFieldMapping = {
  timestampMode: "SINGLE",
  date: "date",
  time: "",
  open: "open",
  high: "high",
  low: "low",
  close: "close",
  volume: "",
};

type HeaderRule = {
  field: ImportRuleFieldKey;
  names: string[];
  score: number;
  reason: string;
  family?: ImportRulePriceFamily;
};

const HEADER_RULES: HeaderRule[] = [
  {
    field: "date",
    names: [
      "date",
      "datetime",
      "timestamp",
      "time",
      "trade_date",
      "trading_date",
      "交易日期",
      "日期",
      "日期时间",
      "时间",
      "open time",
      "opentime",
      "open_time",
      "<date>",
    ],
    score: 100,
    reason: "TIME_PRIMARY",
  },
  {
    field: "date",
    names: ["close time", "closetime", "close_time"],
    score: 62,
    reason: "TIME_CLOSE_FALLBACK",
  },
  {
    field: "time",
    names: [
      "time",
      "tm",
      "clock",
      "hour",
      "minute",
      "second",
      "时刻",
      "<time>",
    ],
    score: 100,
    reason: "TIME_SPLIT",
  },
  {
    field: "open",
    names: [
      "adj_open",
      "adjusted open",
      "adjusted_open",
      "前复权开盘",
      "复权开盘",
    ],
    score: 112,
    reason: "ADJUSTED_OHLC",
    family: "ADJUSTED",
  },
  {
    field: "high",
    names: [
      "adj_high",
      "adjusted high",
      "adjusted_high",
      "前复权最高",
      "复权最高",
    ],
    score: 112,
    reason: "ADJUSTED_OHLC",
    family: "ADJUSTED",
  },
  {
    field: "low",
    names: [
      "adj_low",
      "adjusted low",
      "adjusted_low",
      "前复权最低",
      "复权最低",
    ],
    score: 112,
    reason: "ADJUSTED_OHLC",
    family: "ADJUSTED",
  },
  {
    field: "close",
    names: [
      "adj_close",
      "adjusted close",
      "adjusted_close",
      "adj close",
      "前复权收盘",
      "复权收盘",
    ],
    score: 112,
    reason: "ADJUSTED_OHLC",
    family: "ADJUSTED",
  },
  {
    field: "volume",
    names: ["adj_volume", "adjusted volume", "adjusted_volume"],
    score: 108,
    reason: "ADJUSTED_VOLUME",
    family: "ADJUSTED",
  },
  {
    field: "open",
    names: [
      "opening price",
      "open price",
      "open",
      "o",
      "session open",
      "daily open",
      "开盘价",
      "开盘",
      "<open>",
    ],
    score: 100,
    reason: "RAW_OHLC",
    family: "RAW",
  },
  {
    field: "high",
    names: [
      "high price",
      "highest price",
      "high",
      "h",
      "最高价",
      "最高",
      "<high>",
    ],
    score: 100,
    reason: "RAW_OHLC",
    family: "RAW",
  },
  {
    field: "low",
    names: ["low price", "lowest price", "low", "l", "最低价", "最低", "<low>"],
    score: 100,
    reason: "RAW_OHLC",
    family: "RAW",
  },
  {
    field: "close",
    names: [
      "closing price",
      "close price",
      "close",
      "c",
      "settlement price",
      "last price",
      "收盘价",
      "收盘",
      "<close>",
    ],
    score: 100,
    reason: "RAW_OHLC",
    family: "RAW",
  },
  {
    field: "volume",
    names: [
      "volume",
      "vol",
      "v",
      "qty",
      "quantity",
      "成交量",
      "量",
      "<vol>",
      "<tickvol>",
    ],
    score: 100,
    reason: "VOLUME",
    family: "GENERIC",
  },
];

const PRICE_FIELDS: ImportRuleRequiredFieldKey[] = [
  "open",
  "high",
  "low",
  "close",
];

const normalizeFullWidthAscii = (value: string): string =>
  value.replace(/[\uFF01-\uFF5E]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0xfee0),
  );

export const normalizeImportHeader = (value: string): string =>
  normalizeFullWidthAscii(String(value ?? ""))
    .normalize("NFKC")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[<>]/g, "")
    .replace(/\bprice\b/g, "")
    .replace(/[\s_\-()[\]{}./\\|:]+/g, "")
    .replace(/价/g, "")
    .replace(/量/g, "volume")
    .replace(/额/g, "amount");

const normalizedRuleNames = HEADER_RULES.map((rule) => ({
  ...rule,
  normalizedNames: rule.names.map(normalizeImportHeader).filter(Boolean),
}));

const toConfidence = (score: number): ImportRuleConfidence => {
  if (score >= 90) {
    return "HIGH";
  }
  if (score >= 65) {
    return "MEDIUM";
  }
  return "LOW";
};

const uniqueCandidates = (
  candidates: ImportRuleFieldCandidate[],
): ImportRuleFieldCandidate[] => {
  const byKey = new Map<string, ImportRuleFieldCandidate>();
  candidates.forEach((candidate) => {
    const key = `${candidate.field}::${candidate.header}::${candidate.family}`;
    const existing = byKey.get(key);
    if (!existing || candidate.score > existing.score) {
      byKey.set(key, candidate);
    }
  });
  return [...byKey.values()].sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    return left.header.localeCompare(right.header, "en");
  });
};

const collectCandidatesForHeader = (
  header: string,
): ImportRuleFieldCandidate[] => {
  const normalizedHeader = normalizeImportHeader(header);
  if (!normalizedHeader) {
    return [];
  }
  const candidates: ImportRuleFieldCandidate[] = [];
  normalizedRuleNames.forEach((rule) => {
    let matchedScore = -1;
    for (const normalizedName of rule.normalizedNames) {
      if (!normalizedName) {
        continue;
      }
      if (normalizedHeader === normalizedName) {
        matchedScore = Math.max(matchedScore, rule.score);
        continue;
      }
      if (
        normalizedName.length >= 3 &&
        normalizedHeader.length >= 3 &&
        !(rule.family === "RAW" && /^adj(?:usted)?/.test(normalizedHeader)) &&
        normalizedHeader.includes(normalizedName)
      ) {
        matchedScore = Math.max(matchedScore, rule.score - 28);
      }
    }
    if (matchedScore <= 0) {
      return;
    }
    candidates.push({
      field: rule.field,
      header,
      normalizedHeader,
      score: matchedScore,
      reason: rule.reason,
      family: rule.family ?? "GENERIC",
    });
  });
  return candidates;
};

const collectCandidates = (
  headers: readonly string[],
): ImportRuleFieldCandidate[] =>
  uniqueCandidates(
    headers.flatMap((header) => collectCandidatesForHeader(header)),
  );

const candidateByField = (
  candidates: ImportRuleFieldCandidate[],
  field: ImportRuleFieldKey,
  blocked: Set<string>,
  family?: ImportRulePriceFamily,
): ImportRuleFieldCandidate | null =>
  candidates
    .filter((candidate) => {
      if (candidate.field !== field || blocked.has(candidate.header)) {
        return false;
      }
      return family ? candidate.family === family : true;
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.header.localeCompare(right.header, "en");
    })[0] ?? null;

const resolvePriceFamily = (
  candidates: ImportRuleFieldCandidate[],
): {
  family: ImportRulePriceFamily;
  conflicts: string[];
} => {
  const conflicts: string[] = [];
  const completeFamilies = (["ADJUSTED", "RAW"] as const).filter((family) =>
    PRICE_FIELDS.every((field) =>
      candidates.some(
        (candidate) => candidate.field === field && candidate.family === family,
      ),
    ),
  );
  if (completeFamilies.includes("ADJUSTED")) {
    return { family: "ADJUSTED", conflicts };
  }
  if (completeFamilies.includes("RAW")) {
    return { family: "RAW", conflicts };
  }

  const matchedPriceFamilies = new Set(
    candidates
      .filter((candidate) =>
        PRICE_FIELDS.includes(candidate.field as ImportRuleRequiredFieldKey),
      )
      .map((candidate) => candidate.family)
      .filter((family) => family === "RAW" || family === "ADJUSTED"),
  );
  if (matchedPriceFamilies.size > 1) {
    conflicts.push("RAW_ADJUSTED_MIXED");
  }
  return { family: "GENERIC", conflicts };
};

export const resolveImportFieldRenderOrder = (
  timestampMode: ImportRuleTimestampMode,
): ImportRuleFieldKey[] =>
  timestampMode === "SPLIT"
    ? [...IMPORT_SPLIT_FIELD_RENDER_ORDER]
    : [...IMPORT_FIELD_RENDER_ORDER];

export const buildImportFieldMappingProfile = (
  headersRaw: readonly string[],
): ImportRuleMappingProfile => {
  const headers = headersRaw
    .map((header) => String(header ?? "").trim())
    .filter(Boolean);
  const candidates = collectCandidates(headers);
  const blocked = new Set<string>();
  const conflicts: string[] = [];

  const dateCandidate = candidateByField(candidates, "date", blocked);
  if (dateCandidate) {
    blocked.add(dateCandidate.header);
  }
  const timeCandidate = candidateByField(candidates, "time", blocked);
  // A fuzzy substring match such as `close_time` must not turn a complete
  // `open_time` timestamp into a split date/time mapping. Automatic split
  // mode is safe only for a strong, explicit clock-column match.
  const shouldUseSplitMode = Boolean(
    dateCandidate &&
    timeCandidate &&
    timeCandidate.reason === "TIME_SPLIT" &&
    timeCandidate.score >= 90,
  );
  if (shouldUseSplitMode && timeCandidate) {
    blocked.add(timeCandidate.header);
  }

  const { family: priceFamily, conflicts: priceConflicts } =
    resolvePriceFamily(candidates);
  conflicts.push(...priceConflicts);
  const selectedByField = new Map<
    ImportRuleFieldKey,
    ImportRuleFieldCandidate
  >();
  if (dateCandidate) {
    selectedByField.set("date", dateCandidate);
  }
  if (shouldUseSplitMode && timeCandidate) {
    selectedByField.set("time", timeCandidate);
  }
  for (const field of PRICE_FIELDS) {
    const selected =
      priceFamily === "GENERIC"
        ? candidateByField(candidates, field, blocked)
        : candidateByField(candidates, field, blocked, priceFamily);
    if (selected) {
      selectedByField.set(field, selected);
      blocked.add(selected.header);
    }
  }
  const volumeSelected =
    (priceFamily !== "GENERIC"
      ? candidateByField(candidates, "volume", blocked, priceFamily)
      : null) ?? candidateByField(candidates, "volume", blocked);
  if (volumeSelected) {
    selectedByField.set("volume", volumeSelected);
  }

  const missingFields = IMPORT_REQUIRED_FIELDS.filter(
    (field) => !selectedByField.has(field),
  );
  if (missingFields.length > 0) {
    conflicts.push("REQUIRED_FIELD_MISSING");
  }
  const duplicateHeaders = new Set<string>();
  const seenHeaders = new Set<string>();
  resolveImportFieldRenderOrder(
    shouldUseSplitMode ? "SPLIT" : "SINGLE",
  ).forEach((field) => {
    const header = selectedByField.get(field)?.header ?? "";
    if (!header) {
      return;
    }
    if (seenHeaders.has(header)) {
      duplicateHeaders.add(header);
      return;
    }
    seenHeaders.add(header);
  });
  if (duplicateHeaders.size > 0) {
    conflicts.push("FIELD_MAPPING_DUPLICATED");
  }

  const mapping: ImportRuleFieldMapping = {
    timestampMode: shouldUseSplitMode ? "SPLIT" : "SINGLE",
    date: selectedByField.get("date")?.header ?? "",
    time: shouldUseSplitMode ? (selectedByField.get("time")?.header ?? "") : "",
    open: selectedByField.get("open")?.header ?? "",
    high: selectedByField.get("high")?.header ?? "",
    low: selectedByField.get("low")?.header ?? "",
    close: selectedByField.get("close")?.header ?? "",
    volume: selectedByField.get("volume")?.header ?? "",
  };
  const requiredScores = IMPORT_REQUIRED_FIELDS.map(
    (field) => selectedByField.get(field)?.score ?? 0,
  );
  const score =
    requiredScores.length > 0
      ? Math.round(
          requiredScores.reduce((sum, value) => sum + value, 0) /
            requiredScores.length,
        )
      : 0;
  const isImportable =
    missingFields.length <= 0 && !conflicts.includes("RAW_ADJUSTED_MIXED");
  const confidence = isImportable ? toConfidence(score) : "LOW";
  const fieldDiagnostics: ImportRuleFieldDiagnostic[] =
    resolveImportFieldRenderOrder(mapping.timestampMode).map((field) => {
      const selected = selectedByField.get(field) ?? null;
      const fieldCandidates = candidates.filter(
        (candidate) => candidate.field === field,
      );
      const isOptionalVolume = field === "volume";
      const status: ImportRuleFieldDiagnostic["status"] = selected
        ? duplicateHeaders.has(selected.header)
          ? "CONFLICT"
          : "MATCHED"
        : isOptionalVolume
          ? "MATCHED"
          : "MISSING";
      return {
        field,
        status,
        selectedHeader: selected?.header ?? "",
        confidence: selected
          ? toConfidence(selected.score)
          : isOptionalVolume
            ? "HIGH"
            : "LOW",
        reason:
          selected?.reason ??
          (isOptionalVolume ? "OPTIONAL_VOLUME_DEFAULT_ZERO" : "FIELD_MISSING"),
        candidates: fieldCandidates.slice(0, 6),
      };
    });
  const canonicalSchemaKey = [
    `ts:${mapping.timestampMode}`,
    `price:${priceFamily}`,
    "volume:OPTIONAL",
  ].join("|");

  return {
    mapping,
    canonicalSchemaKey,
    priceFamily,
    confidence,
    score,
    isImportable,
    conflicts: Array.from(new Set(conflicts)),
    fieldDiagnostics,
  };
};

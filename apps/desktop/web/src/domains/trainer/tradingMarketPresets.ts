// SPDX-License-Identifier: GPL-3.0-only

import {
  APP_UI_LANGUAGES,
  getTradingSettingsText,
} from '@/ui/config/uiConfig';
import { INPUT_LIMITS, trimAndLimitInputText } from '@zinuto/shared/input-limits';
import { isLocaleCatalogLoaded } from '@zinuto/shared/i18n';
import { DEFAULT_TRADING_SETTINGS_FORM_VALUES } from '@/domains/trainer/tradingSettingsFormDomain';

export const TRADING_ASSET_CLASS_IDS = ['STOCK', 'FUTURES', 'FOREX', 'CRYPTO'] as const;

export type TradingAssetClassId = (typeof TRADING_ASSET_CLASS_IDS)[number];
export type TradingAssetClass = TradingAssetClassId;
export type TradingMarketPresetId = string;

export type TradingMarketPresetValues = {
  assetClass: TradingAssetClass;
  tradeSettlementMode: 'T0' | 'T1';
  minTradeStepInput: string;
  commissionRateInput: string;
  makerFeeRateInput: string;
  takerFeeRateInput: string;
  fundingRateInput: string;
  contractMultiplierInput: string;
  slippageRateInput: string;
  stampDutyRateInput: string;
  stampDutyMode: 'BUY' | 'SELL' | 'DOUBLE';
  transferFeeRateInput: string;
  regulatoryFeeRateInput: string;
  commissionMinimumFeeInput: string;
  transactionLevyRateInput: string;
  transactionLevyMinimumFeeInput: string;
  platformFeeRateInput: string;
  platformFeeMinimumFeeInput: string;
  longFinancingAnnualRateInput: string;
  longInitialMarginRatioInput: string;
  longMaintenanceMarginRatioInput: string;
  allowLongMarginTrading: boolean;
  allowShortSelling: boolean;
  shortBorrowAnnualRateInput: string;
  shortInitialMarginRatioInput: string;
  shortMaintenanceMarginRatioInput: string;
};

const SEEDED_BUILT_IN_TRADING_MARKET_PRESET_IDS = [
  'A_SHARE',
  'HK_STOCK',
  'US_STOCK',
  'JP_STOCK',
  'KR_STOCK',
  'TW_STOCK',
  'FUTURES_COMMODITY',
  'FUTURES_FINANCIAL',
  'FOREX_STANDARD_LOT',
  'FOREX_MICRO_LOT',
  'CRYPTO_SPOT',
  'CRYPTO_USDT_PERP',
] as const;

export type BuiltInTradingMarketPresetId =
  (typeof SEEDED_BUILT_IN_TRADING_MARKET_PRESET_IDS)[number];

export type TradingCustomFeeTemplateMeta = {
  id: string;
  name: string;
  assetClass: TradingAssetClass;
};

export type TradingMarketPresetLabelOverridesById = Partial<Record<TradingMarketPresetId, string>>;
export type TradingMarketPresetValuesByKey = Record<TradingMarketPresetId, TradingMarketPresetValues>;

export const normalizeTradingMarketPresetTemplateName = (value: unknown): string =>
  trimAndLimitInputText(String(value ?? ""), INPUT_LIMITS.tradingPresetNameChars);

export const ADD_TRADING_FEE_TEMPLATE_OPTION_ID = '__ADD_TRADING_FEE_TEMPLATE__';

export type TrainerTradingFormFacts = {
  schemaVersion?: string;
  catalogVersion?: string;
  orderInputModes?: string[];
  priceModes?: string[];
  assetClasses?: TradingAssetClass[];
  builtInPresetIds: string[];
  builtInPresetAssetClassById: Record<string, TradingAssetClass>;
  defaultPresetIdByAssetClass: Record<TradingAssetClass, string>;
  defaultPresetId: string;
  presetAvailabilityById?: Record<
    string,
    {
      available?: boolean;
      disabledReasonCode?: string | null;
    }
  >;
  presetValuesById: Record<string, TradingMarketPresetValues>;
};

export const BUILT_IN_TRADING_MARKET_PRESET_IDS: BuiltInTradingMarketPresetId[] = [
  ...SEEDED_BUILT_IN_TRADING_MARKET_PRESET_IDS,
];

export const BUILT_IN_TRADING_MARKET_PRESET_ASSET_CLASS_BY_ID: Record<
  string,
  TradingAssetClass
> = {
  A_SHARE: 'STOCK',
  HK_STOCK: 'STOCK',
  US_STOCK: 'STOCK',
  JP_STOCK: 'STOCK',
  KR_STOCK: 'STOCK',
  TW_STOCK: 'STOCK',
  FUTURES_COMMODITY: 'FUTURES',
  FUTURES_FINANCIAL: 'FUTURES',
  FOREX_STANDARD_LOT: 'FOREX',
  FOREX_MICRO_LOT: 'FOREX',
  CRYPTO_SPOT: 'CRYPTO',
  CRYPTO_USDT_PERP: 'CRYPTO',
};

export const DEFAULT_TRADING_MARKET_PRESET_ID_BY_ASSET_CLASS: Record<
  TradingAssetClass,
  BuiltInTradingMarketPresetId
> = {
  STOCK: 'A_SHARE',
  FUTURES: 'FUTURES_COMMODITY',
  FOREX: 'FOREX_STANDARD_LOT',
  CRYPTO: 'CRYPTO_SPOT',
};

export let DEFAULT_TRADING_MARKET_PRESET_ID: BuiltInTradingMarketPresetId = 'A_SHARE';

export const DEFAULT_TRADING_MARKET_PRESET_VALUES_BY_ID: Record<
  string,
  TradingMarketPresetValues
> = {};

export const TRADING_MARKET_PRESET_AVAILABILITY_BY_ID: Record<
  string,
  {
    available: boolean;
    disabledReasonCode: string | null;
  }
> = {};

const createFallbackPresetValues = (
  assetClass: TradingAssetClass,
): TradingMarketPresetValues => ({
  assetClass,
  tradeSettlementMode: assetClass === 'STOCK' ? 'T1' : 'T0',
  minTradeStepInput: DEFAULT_TRADING_SETTINGS_FORM_VALUES.minTradeStepInput,
  commissionRateInput: DEFAULT_TRADING_SETTINGS_FORM_VALUES.commissionRateInput,
  makerFeeRateInput: DEFAULT_TRADING_SETTINGS_FORM_VALUES.makerFeeRateInput,
  takerFeeRateInput: DEFAULT_TRADING_SETTINGS_FORM_VALUES.takerFeeRateInput,
  fundingRateInput: DEFAULT_TRADING_SETTINGS_FORM_VALUES.fundingRateInput,
  contractMultiplierInput: DEFAULT_TRADING_SETTINGS_FORM_VALUES.contractMultiplierInput,
  slippageRateInput: DEFAULT_TRADING_SETTINGS_FORM_VALUES.slippageRateInput,
  stampDutyRateInput: DEFAULT_TRADING_SETTINGS_FORM_VALUES.stampDutyRateInput,
  stampDutyMode: 'SELL',
  transferFeeRateInput: DEFAULT_TRADING_SETTINGS_FORM_VALUES.transferFeeRateInput,
  regulatoryFeeRateInput: DEFAULT_TRADING_SETTINGS_FORM_VALUES.regulatoryFeeRateInput,
  commissionMinimumFeeInput: DEFAULT_TRADING_SETTINGS_FORM_VALUES.commissionMinimumFeeInput,
  transactionLevyRateInput: DEFAULT_TRADING_SETTINGS_FORM_VALUES.transactionLevyRateInput,
  transactionLevyMinimumFeeInput:
    DEFAULT_TRADING_SETTINGS_FORM_VALUES.transactionLevyMinimumFeeInput,
  platformFeeRateInput: DEFAULT_TRADING_SETTINGS_FORM_VALUES.platformFeeRateInput,
  platformFeeMinimumFeeInput:
    DEFAULT_TRADING_SETTINGS_FORM_VALUES.platformFeeMinimumFeeInput,
  longFinancingAnnualRateInput:
    DEFAULT_TRADING_SETTINGS_FORM_VALUES.longFinancingAnnualRateInput,
  longInitialMarginRatioInput:
    DEFAULT_TRADING_SETTINGS_FORM_VALUES.longInitialMarginRatioInput,
  longMaintenanceMarginRatioInput:
    DEFAULT_TRADING_SETTINGS_FORM_VALUES.longMaintenanceMarginRatioInput,
  allowLongMarginTrading: false,
  allowShortSelling: false,
  shortBorrowAnnualRateInput:
    DEFAULT_TRADING_SETTINGS_FORM_VALUES.shortBorrowAnnualRateInput,
  shortInitialMarginRatioInput:
    DEFAULT_TRADING_SETTINGS_FORM_VALUES.shortInitialMarginRatioInput,
  shortMaintenanceMarginRatioInput:
    DEFAULT_TRADING_SETTINGS_FORM_VALUES.shortMaintenanceMarginRatioInput,
});

const getBuiltInTradingMarketPresetDefaultLabels = (
  presetId: string,
): ReadonlySet<string> =>
  new Set(
    APP_UI_LANGUAGES.filter((language) =>
      isLocaleCatalogLoaded(language),
    ).map((language) =>
      String(
        (getTradingSettingsText(language).marketPresetLabels as Record<string, string>)[
          presetId
        ] ?? '',
      ).trim()
    ).filter((label) => label.length > 0),
  );

export const isBuiltInTradingMarketPresetId = (
  value: string,
): value is BuiltInTradingMarketPresetId =>
  BUILT_IN_TRADING_MARKET_PRESET_IDS.includes(value as BuiltInTradingMarketPresetId);

const normalizeInputString = (value: unknown, fallback: string): string => {
  if (typeof value !== 'string') {
    return fallback;
  }
  const normalized = value.trim();
  return normalized ? normalized : fallback;
};

const normalizeStampDutyMode = (value: unknown, fallback: TradingMarketPresetValues['stampDutyMode']) => {
  return value === 'BUY' || value === 'SELL' || value === 'DOUBLE' ? value : fallback;
};

const readTPlusMode = (
  value: unknown,
  fallback: TradingMarketPresetValues['tradeSettlementMode'],
): TradingMarketPresetValues['tradeSettlementMode'] =>
  value === 'T0' || value === 'T1' ? value : fallback;

export const normalizeTradingAssetClass = (value: unknown, fallback: TradingAssetClass = 'STOCK'): TradingAssetClass =>
  value === 'STOCK' || value === 'FUTURES' || value === 'FOREX' || value === 'CRYPTO'
    ? value
    : fallback;

const resolveDefaultTradingMarketPresetId = (
  assetClass: TradingAssetClass,
): TradingMarketPresetId =>
  DEFAULT_TRADING_MARKET_PRESET_ID_BY_ASSET_CLASS[assetClass] ??
  DEFAULT_TRADING_MARKET_PRESET_ID;

const resolveTradingMarketPresetDefaultValues = (
  presetId: TradingMarketPresetId,
  assetClass: TradingAssetClass,
): TradingMarketPresetValues =>
  DEFAULT_TRADING_MARKET_PRESET_VALUES_BY_ID[presetId] ??
  createFallbackPresetValues(assetClass);

const normalizePresetValues = (raw: unknown, fallback: TradingMarketPresetValues): TradingMarketPresetValues => {
  const object = raw && typeof raw === 'object' ? (raw as Partial<TradingMarketPresetValues>) : {};
  return {
    assetClass: normalizeTradingAssetClass(object.assetClass, fallback.assetClass),
    tradeSettlementMode: readTPlusMode(object.tradeSettlementMode, fallback.tradeSettlementMode),
    minTradeStepInput: normalizeInputString(object.minTradeStepInput, fallback.minTradeStepInput),
    commissionRateInput: normalizeInputString(object.commissionRateInput, fallback.commissionRateInput),
    makerFeeRateInput: normalizeInputString(object.makerFeeRateInput, fallback.makerFeeRateInput),
    takerFeeRateInput: normalizeInputString(object.takerFeeRateInput, fallback.takerFeeRateInput),
    fundingRateInput: normalizeInputString(object.fundingRateInput, fallback.fundingRateInput),
    contractMultiplierInput: normalizeInputString(object.contractMultiplierInput, fallback.contractMultiplierInput),
    slippageRateInput: normalizeInputString(object.slippageRateInput, fallback.slippageRateInput),
    stampDutyRateInput: normalizeInputString(object.stampDutyRateInput, fallback.stampDutyRateInput),
    stampDutyMode: normalizeStampDutyMode(object.stampDutyMode, fallback.stampDutyMode),
    transferFeeRateInput: normalizeInputString(object.transferFeeRateInput, fallback.transferFeeRateInput),
    regulatoryFeeRateInput: normalizeInputString(object.regulatoryFeeRateInput, fallback.regulatoryFeeRateInput),
    commissionMinimumFeeInput: normalizeInputString(object.commissionMinimumFeeInput, fallback.commissionMinimumFeeInput),
    transactionLevyRateInput: normalizeInputString(object.transactionLevyRateInput, fallback.transactionLevyRateInput),
    transactionLevyMinimumFeeInput: normalizeInputString(
      object.transactionLevyMinimumFeeInput,
      fallback.transactionLevyMinimumFeeInput
    ),
    platformFeeRateInput: normalizeInputString(object.platformFeeRateInput, fallback.platformFeeRateInput),
    platformFeeMinimumFeeInput: normalizeInputString(object.platformFeeMinimumFeeInput, fallback.platformFeeMinimumFeeInput),
    longFinancingAnnualRateInput: normalizeInputString(
      object.longFinancingAnnualRateInput,
      fallback.longFinancingAnnualRateInput
    ),
    longInitialMarginRatioInput: normalizeInputString(
      object.longInitialMarginRatioInput,
      fallback.longInitialMarginRatioInput
    ),
    longMaintenanceMarginRatioInput: normalizeInputString(
      object.longMaintenanceMarginRatioInput,
      fallback.longMaintenanceMarginRatioInput
    ),
    allowLongMarginTrading:
      typeof object.allowLongMarginTrading === 'boolean'
        ? object.allowLongMarginTrading
        : fallback.allowLongMarginTrading,
    allowShortSelling: typeof object.allowShortSelling === 'boolean' ? object.allowShortSelling : fallback.allowShortSelling,
    shortBorrowAnnualRateInput: normalizeInputString(object.shortBorrowAnnualRateInput, fallback.shortBorrowAnnualRateInput),
    shortInitialMarginRatioInput: normalizeInputString(
      object.shortInitialMarginRatioInput,
      fallback.shortInitialMarginRatioInput
    ),
    shortMaintenanceMarginRatioInput: normalizeInputString(
      object.shortMaintenanceMarginRatioInput,
      fallback.shortMaintenanceMarginRatioInput
    )
  };
};

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const toUniqueStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const result: string[] = [];
  value.forEach((item) => {
    const normalized = String(item ?? '').trim();
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    result.push(normalized);
  });
  return result;
};

export const normalizeTrainerTradingFormFacts = (
  value: unknown,
): TrainerTradingFormFacts | null => {
  const facts = toRecord(value);
  const builtInPresetIds = toUniqueStringArray(facts.builtInPresetIds);
  if (!builtInPresetIds.length) {
    return null;
  }
  const assetClassByIdSource = toRecord(facts.builtInPresetAssetClassById);
  const defaultPresetIdByAssetClassSource = toRecord(
    facts.defaultPresetIdByAssetClass,
  );
  const presetValuesByIdSource = toRecord(facts.presetValuesById);
  const presetAvailabilityByIdSource = toRecord(facts.presetAvailabilityById);

  const builtInPresetAssetClassById: Record<string, TradingAssetClass> = {};
  builtInPresetIds.forEach((presetId) => {
    builtInPresetAssetClassById[presetId] = normalizeTradingAssetClass(
      assetClassByIdSource[presetId],
      'STOCK',
    );
  });

  const defaultPresetIdByAssetClass = TRADING_ASSET_CLASS_IDS.reduce(
    (result, assetClass) => {
      const candidate = String(
        defaultPresetIdByAssetClassSource[assetClass] ?? '',
      ).trim();
      const candidateAssetClass = candidate
        ? builtInPresetAssetClassById[candidate]
        : null;
      result[assetClass] =
        candidate && candidateAssetClass === assetClass
          ? candidate
          : builtInPresetIds.find(
              (presetId) => builtInPresetAssetClassById[presetId] === assetClass,
            ) ?? resolveDefaultTradingMarketPresetId(assetClass);
      return result;
    },
    {} as Record<TradingAssetClass, string>,
  );

  const defaultPresetIdRaw = String(facts.defaultPresetId ?? '').trim();
  const defaultPresetId =
    defaultPresetIdRaw && builtInPresetIds.includes(defaultPresetIdRaw)
      ? defaultPresetIdRaw
      : defaultPresetIdByAssetClass.STOCK;

  const presetValuesById = builtInPresetIds.reduce(
    (result, presetId) => {
      const assetClass = builtInPresetAssetClassById[presetId] ?? 'STOCK';
      result[presetId] = normalizePresetValues(
        presetValuesByIdSource[presetId],
        createFallbackPresetValues(assetClass),
      );
      result[presetId].assetClass = assetClass;
      return result;
    },
    {} as Record<string, TradingMarketPresetValues>,
  );

  const presetAvailabilityById = builtInPresetIds.reduce<
    NonNullable<TrainerTradingFormFacts['presetAvailabilityById']>
  >((result, presetId) => {
    const availability = toRecord(presetAvailabilityByIdSource[presetId]);
    result[presetId] = {
      available: availability.available !== false,
      disabledReasonCode:
        typeof availability.disabledReasonCode === 'string' &&
        availability.disabledReasonCode.trim()
          ? availability.disabledReasonCode.trim()
          : null,
    };
    return result;
  }, {});

  return {
    schemaVersion:
      typeof facts.schemaVersion === 'string' ? facts.schemaVersion : undefined,
    catalogVersion:
      typeof facts.catalogVersion === 'string' ? facts.catalogVersion : undefined,
    orderInputModes: toUniqueStringArray(facts.orderInputModes),
    priceModes: toUniqueStringArray(facts.priceModes),
    assetClasses: TRADING_ASSET_CLASS_IDS.filter((assetClass) =>
      Array.isArray(facts.assetClasses)
        ? facts.assetClasses.includes(assetClass)
        : true,
    ),
    builtInPresetIds,
    builtInPresetAssetClassById,
    defaultPresetIdByAssetClass,
    defaultPresetId,
    presetAvailabilityById,
    presetValuesById,
  };
};

const replaceArrayContents = <T>(target: T[], source: readonly T[]) => {
  target.splice(0, target.length, ...source);
};

const replaceRecordContents = <T>(
  target: Record<string, T>,
  source: Record<string, T>,
) => {
  Object.keys(target).forEach((key) => {
    delete target[key];
  });
  Object.entries(source).forEach(([key, item]) => {
    target[key] = item;
  });
};

export const applyTrainerTradingFormFacts = (value: unknown): boolean => {
  const facts = normalizeTrainerTradingFormFacts(value);
  if (!facts) {
    return false;
  }
  replaceArrayContents(
    BUILT_IN_TRADING_MARKET_PRESET_IDS,
    facts.builtInPresetIds as BuiltInTradingMarketPresetId[],
  );
  replaceRecordContents(
    BUILT_IN_TRADING_MARKET_PRESET_ASSET_CLASS_BY_ID,
    facts.builtInPresetAssetClassById,
  );
  replaceRecordContents(
    DEFAULT_TRADING_MARKET_PRESET_ID_BY_ASSET_CLASS as Record<string, BuiltInTradingMarketPresetId>,
    facts.defaultPresetIdByAssetClass as Record<string, BuiltInTradingMarketPresetId>,
  );
  DEFAULT_TRADING_MARKET_PRESET_ID = facts.defaultPresetId as BuiltInTradingMarketPresetId;
  replaceRecordContents(
    TRADING_MARKET_PRESET_AVAILABILITY_BY_ID,
    facts.presetAvailabilityById ?? {},
  );
  replaceRecordContents(
    DEFAULT_TRADING_MARKET_PRESET_VALUES_BY_ID,
    facts.presetValuesById,
  );
  return true;
};

export const applyTrainerTradingFormFactsFromReadModel = (
  readModel: unknown,
): boolean =>
  applyTrainerTradingFormFacts(toRecord(toRecord(readModel).facts).tradingForm);

export const normalizeTradingMarketPresetId = (
  value: unknown,
  preferredAssetClass: TradingAssetClass = 'STOCK'
): TradingMarketPresetId => {
  if (typeof value !== 'string') {
    return resolveDefaultTradingMarketPresetId(preferredAssetClass);
  }
  const normalized = value.trim();
  if (!normalized) {
    return resolveDefaultTradingMarketPresetId(preferredAssetClass);
  }
  if (isBuiltInTradingMarketPresetId(normalized)) {
    const expectedAssetClass = BUILT_IN_TRADING_MARKET_PRESET_ASSET_CLASS_BY_ID[normalized];
    if (expectedAssetClass !== preferredAssetClass) {
      return resolveDefaultTradingMarketPresetId(preferredAssetClass);
    }
  }
  return normalized;
};

export const resolveBuiltInTradingMarketPresetAssetClass = (
  presetId: BuiltInTradingMarketPresetId
): TradingAssetClass => BUILT_IN_TRADING_MARKET_PRESET_ASSET_CLASS_BY_ID[presetId] ?? 'STOCK';

export const listBuiltInTradingMarketPresetIdsByAssetClass = (
  assetClass: TradingAssetClass
): BuiltInTradingMarketPresetId[] =>
  BUILT_IN_TRADING_MARKET_PRESET_IDS.filter(
    (presetId) => BUILT_IN_TRADING_MARKET_PRESET_ASSET_CLASS_BY_ID[presetId] === assetClass
  );

export const normalizeHiddenBuiltInTradingMarketPresetIds = (value: unknown): BuiltInTradingMarketPresetId[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const next: BuiltInTradingMarketPresetId[] = [];
  value.forEach((item) => {
    const presetId = String(item || '').trim();
    if (!isBuiltInTradingMarketPresetId(presetId)) {
      return;
    }
    if (seen.has(presetId)) {
      return;
    }
    seen.add(presetId);
    next.push(presetId);
  });
  return next;
};

export const normalizeTradingMarketPresetLabelOverridesById = (
  value: unknown
): TradingMarketPresetLabelOverridesById => {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const next: TradingMarketPresetLabelOverridesById = {};
  Object.entries(raw).forEach(([rawKey, rawValue]) => {
    const key = String(rawKey ?? '').trim();
    const label = normalizeTradingMarketPresetTemplateName(rawValue);
    if (!key || !label || key === ADD_TRADING_FEE_TEMPLATE_OPTION_ID) {
      return;
    }
    if (
      isBuiltInTradingMarketPresetId(key) &&
      getBuiltInTradingMarketPresetDefaultLabels(key).has(label)
    ) {
      return;
    }
    next[key] = label;
  });
  return next;
};

export const normalizeTradingMarketPresetValuesById = (
  value: unknown
): TradingMarketPresetValuesByKey => {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const next: TradingMarketPresetValuesByKey = {};
  Object.keys(raw).forEach((key) => {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey || normalizedKey === ADD_TRADING_FEE_TEMPLATE_OPTION_ID) {
      return;
    }
    const isBuiltInPreset = isBuiltInTradingMarketPresetId(normalizedKey);
    const rawValue = raw[normalizedKey];
    const preferredAssetClass = normalizeTradingAssetClass(
      isBuiltInPreset
        ? resolveBuiltInTradingMarketPresetAssetClass(normalizedKey)
        : rawValue && typeof rawValue === 'object'
          ? (rawValue as Partial<TradingMarketPresetValues>).assetClass
          : 'STOCK',
      'STOCK',
    );
    const fallbackPresetId = resolveDefaultTradingMarketPresetId(preferredAssetClass);
    const fallback =
      next[normalizedKey] ??
      (isBuiltInPreset
        ? resolveTradingMarketPresetDefaultValues(
            normalizedKey,
            preferredAssetClass,
          )
        : null) ??
      resolveTradingMarketPresetDefaultValues(
        fallbackPresetId,
        preferredAssetClass,
      );
    const normalized = normalizePresetValues(rawValue, fallback);
    next[normalizedKey] = isBuiltInPreset
      ? {
          ...normalized,
          assetClass: preferredAssetClass,
        }
      : normalized;
  });
  return next;
};

export const normalizeTradingMarketPresetValuesByKey = normalizeTradingMarketPresetValuesById;

const withTradingMarketPresetAssetClass = (
  values: TradingMarketPresetValues,
  assetClass: TradingAssetClass,
): TradingMarketPresetValues =>
  values.assetClass === assetClass
    ? values
    : {
        ...values,
        assetClass,
      };

export const resolveTradingMarketPresetValuesFromState = ({
  presetId,
  assetClass,
  valuesByKey,
  isPresetAvailable,
  resolveFallbackPresetId,
  activeDraft,
}: {
  presetId: TradingMarketPresetId;
  assetClass: TradingAssetClass;
  valuesByKey: TradingMarketPresetValuesByKey;
  isPresetAvailable: (
    presetId: TradingMarketPresetId,
    assetClass: TradingAssetClass,
  ) => boolean;
  resolveFallbackPresetId: (
    assetClass: TradingAssetClass,
    options?: {
      excludeId?: string;
    },
  ) => TradingMarketPresetId;
  activeDraft?: {
    presetId: TradingMarketPresetId;
    values: TradingMarketPresetValues;
  };
}): TradingMarketPresetValues => {
  const resolveCandidateValues = (
    candidateId: TradingMarketPresetId,
  ): TradingMarketPresetValues | null => {
    const normalizedCandidateId = String(candidateId || '').trim();
    if (
      !normalizedCandidateId ||
      !isPresetAvailable(normalizedCandidateId, assetClass)
    ) {
      return null;
    }
    if (
      activeDraft &&
      String(activeDraft.presetId || '').trim() === normalizedCandidateId &&
      activeDraft.values.assetClass === assetClass
    ) {
      return withTradingMarketPresetAssetClass(activeDraft.values, assetClass);
    }
    const fromState = valuesByKey[normalizedCandidateId];
    if (fromState) {
      return withTradingMarketPresetAssetClass(fromState, assetClass);
    }
    if (isBuiltInTradingMarketPresetId(normalizedCandidateId)) {
      return withTradingMarketPresetAssetClass(
        resolveTradingMarketPresetDefaultValues(
          normalizedCandidateId,
          assetClass,
        ),
        assetClass,
      );
    }
    return null;
  };

  const normalizedPresetId = String(presetId || '').trim();
  const directValues = resolveCandidateValues(normalizedPresetId);
  if (directValues) {
    return directValues;
  }

  const fallbackPresetId = resolveFallbackPresetId(assetClass, {
    excludeId: normalizedPresetId,
  });
  const fallbackValues = resolveCandidateValues(fallbackPresetId);
  if (fallbackValues) {
    return fallbackValues;
  }

  const defaultFallbackPresetId = resolveDefaultTradingMarketPresetId(assetClass);
  return withTradingMarketPresetAssetClass(
    resolveTradingMarketPresetDefaultValues(defaultFallbackPresetId, assetClass),
    assetClass,
  );
};

const normalizeTemplateName = (value: unknown): string =>
  normalizeTradingMarketPresetTemplateName(value);

export const normalizeTradingCustomFeeTemplates = (value: unknown): TradingCustomFeeTemplateMeta[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const next: TradingCustomFeeTemplateMeta[] = [];
  value.forEach((item) => {
    if (!item || typeof item !== 'object') {
      return;
    }
    const object = item as Partial<TradingCustomFeeTemplateMeta>;
    const id = String(object.id ?? '').trim();
    if (!id || id === ADD_TRADING_FEE_TEMPLATE_OPTION_ID || isBuiltInTradingMarketPresetId(id) || seen.has(id)) {
      return;
    }
    seen.add(id);
    next.push({
      id,
      name: normalizeTemplateName(object.name),
      assetClass: normalizeTradingAssetClass(object.assetClass, 'STOCK')
    });
  });
  return next;
};

export const resolveTradingMarketPresetAssetClass = (
  presetId: TradingMarketPresetId,
  customTemplates: TradingCustomFeeTemplateMeta[]
): TradingAssetClass => {
  if (isBuiltInTradingMarketPresetId(presetId)) {
    return resolveBuiltInTradingMarketPresetAssetClass(presetId);
  }
  const custom = customTemplates.find((item) => item.id === presetId);
  return custom?.assetClass ?? 'STOCK';
};

export const isTradingMarketPresetInAssetClass = (
  presetId: TradingMarketPresetId,
  assetClass: TradingAssetClass,
  customTemplates: TradingCustomFeeTemplateMeta[]
): boolean => {
  const presetAssetClass = resolveTradingMarketPresetAssetClass(presetId, customTemplates);
  return presetAssetClass === assetClass;
};

export const areTradingMarketPresetValuesEqual = (
  left: TradingMarketPresetValues,
  right: TradingMarketPresetValues
): boolean =>
  left.assetClass === right.assetClass &&
  left.tradeSettlementMode === right.tradeSettlementMode &&
  left.minTradeStepInput === right.minTradeStepInput &&
  left.commissionRateInput === right.commissionRateInput &&
  left.makerFeeRateInput === right.makerFeeRateInput &&
  left.takerFeeRateInput === right.takerFeeRateInput &&
  left.fundingRateInput === right.fundingRateInput &&
  left.contractMultiplierInput === right.contractMultiplierInput &&
  left.slippageRateInput === right.slippageRateInput &&
  left.stampDutyRateInput === right.stampDutyRateInput &&
  left.stampDutyMode === right.stampDutyMode &&
  left.transferFeeRateInput === right.transferFeeRateInput &&
  left.regulatoryFeeRateInput === right.regulatoryFeeRateInput &&
  left.commissionMinimumFeeInput === right.commissionMinimumFeeInput &&
  left.transactionLevyRateInput === right.transactionLevyRateInput &&
  left.transactionLevyMinimumFeeInput === right.transactionLevyMinimumFeeInput &&
  left.platformFeeRateInput === right.platformFeeRateInput &&
  left.platformFeeMinimumFeeInput === right.platformFeeMinimumFeeInput &&
  left.longFinancingAnnualRateInput === right.longFinancingAnnualRateInput &&
  left.longInitialMarginRatioInput === right.longInitialMarginRatioInput &&
  left.longMaintenanceMarginRatioInput === right.longMaintenanceMarginRatioInput &&
  left.allowLongMarginTrading === right.allowLongMarginTrading &&
  left.allowShortSelling === right.allowShortSelling &&
  left.shortBorrowAnnualRateInput === right.shortBorrowAnnualRateInput &&
  left.shortInitialMarginRatioInput === right.shortInitialMarginRatioInput &&
  left.shortMaintenanceMarginRatioInput === right.shortMaintenanceMarginRatioInput;

export const resolveTradingMarketPresetDisplayLabel = ({
  presetId,
  builtInLabels,
  customTemplates,
  labelOverridesById,
  fallbackLabel
}: {
  presetId: TradingMarketPresetId;
  builtInLabels: Record<string, string>;
  customTemplates: TradingCustomFeeTemplateMeta[];
  labelOverridesById?: TradingMarketPresetLabelOverridesById;
  fallbackLabel?: string;
}): string => {
  const normalizedPresetId = String(presetId ?? '').trim();
  const override = String(labelOverridesById?.[normalizedPresetId] ?? '').trim();
  if (override) {
    return override;
  }
  const customTemplate = customTemplates.find((item) => item.id === normalizedPresetId);
  const customName = String(customTemplate?.name ?? '').trim();
  if (customName) {
    return customName;
  }
  const builtInLabel = String(builtInLabels[normalizedPresetId] ?? '').trim();
  if (builtInLabel) {
    return builtInLabel;
  }
  return String(fallbackLabel ?? normalizedPresetId).trim();
};

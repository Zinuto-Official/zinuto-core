// SPDX-License-Identifier: GPL-3.0-only

export type FutuSupportCategoryKey =
  | 'quote'
  | 'time'
  | 'reference'
  | 'logic'
  | 'selection'
  | 'math'
  | 'stats'
  | 'shape'
  | 'drawing'
  | 'lineAndColor'
  | 'operator';

export type FutuDataScopeBlockReason =
  | 'REQUIRES_OPTIONS_CHAIN'
  | 'REQUIRES_SESSION_CONTEXT'
  | 'REQUIRES_EXCHANGE_LIMIT_RULES';

export type FutuCapabilitySupportState =
  | 'full'
  | 'blocked-data-scope'
  | 'unsupported';

export type FutuCapabilityEntry = Readonly<{
  name: string;
  categoryKey: FutuSupportCategoryKey;
  callable: boolean;
  syntaxAccepted: boolean;
  runtimeImplemented: boolean;
  renderImplemented: boolean;
  dataScopeBlockedReason: FutuDataScopeBlockReason | null;
  matrixTargetIncluded: boolean;
  supportState: FutuCapabilitySupportState;
}>;

export type VendorFormulaAdapter = Readonly<{
  vendorKey: 'FUTU';
  getCapabilityByName: (name: string) => FutuCapabilityEntry | null;
  getCallableFunctionNameSet: () => ReadonlySet<string>;
  resolveSupportState: (name: string) => FutuCapabilitySupportState;
}>;

type RawCapabilitySeed = Readonly<{
  name: string;
  categoryKey: FutuSupportCategoryKey;
  callable: boolean;
  dataScopeBlockedReason?: FutuDataScopeBlockReason;
  renderImplemented?: boolean;
  runtimeImplemented?: boolean;
  syntaxAccepted?: boolean;
  matrixTargetIncluded?: boolean;
}>;

const UNSUPPORTED_DRAWING_NAMES = new Set<string>([
  'DRAWLINE',
  'DRAWSL',
  'DRAWKLINE',
  'FILLRGN',
  'DRAWBAND',
]);

// Target counts come from the standardized desktop function panel (图3).
export const FUTU_SUPPORT_TARGET_COUNTS: Readonly<Record<FutuSupportCategoryKey, number>> = Object.freeze({
  quote: 17,
  time: 17,
  reference: 53,
  logic: 9,
  selection: 4,
  math: 24,
  stats: 42,
  shape: 8,
  drawing: 9,
  lineAndColor: 27,
  operator: 20,
});

const QUOTE_FUNCTIONS = Object.freeze([
  'H',
  'HIGH',
  'O',
  'OPEN',
  'L',
  'LOW',
  'C',
  'CLOSE',
  'VOL',
  'VOLA',
  'AMOUNT',
  'TOTALAMOUNT',
  'TOTALVOL',
] as const);

const TIME_FUNCTIONS = Object.freeze([
  'PERIOD',
  'DATE',
  'TIME',
  'TIME2',
  'YEAR',
  'MONTH',
  'WEEKOFYEAR',
  'WEEKDAY',
  'DAY',
  'HOUR',
  'MINUTE',
  'DATETODAY',
  'DAYTODATE',
  'TIMETOSEC',
  'SECTOTIME',
  'TOTALFZNUM',
  'FROMOPEN',
] as const);

const REFERENCE_FUNCTIONS = Object.freeze([
  'DRAWNULL',
  'BACKSET',
  'ALIGNRIGHT',
  'BARSCOUNT',
  'BARSTATUS',
  'CURRBARSCOUNT',
  'TOTALBARSCOUNT',
  'ISLASTBAR',
  'BARSLAST',
  'BARSNEXT',
  'BARSSINCEN',
  'BARSSINCE',
  'COUNT',
  'BARSLASTCOUNT',
  'HHV',
  'HHVBARS',
  'HOD',
  'LLV',
  'LLVBARS',
  'LOD',
  'REVERSE',
  'REF',
  'REFV',
  'REFX',
  'REFXV',
  'REFDATE',
  'SUM',
  'MULAR',
  'TR',
  'SUMBARS',
  'MA',
  'SMA',
  'TMA',
  'MEMA',
  'EMA',
  'EXPMA',
  'EXPMEMA',
  'SMMA',
  'WMA',
  'DMA',
  'AMA',
  'XMA',
  'RANGE',
  'TOPRANGE',
  'LOWRANGE',
  'FINDHIGH',
  'FINDHIGHBARS',
  'FINDLOW',
  'FINDLOWBARS',
  'CONST',
  'FILTER',
] as const);

const LOGIC_FUNCTIONS = Object.freeze([
  'CROSS',
  'LONGCROSS',
  'UPNDAY',
  'DOWNNDAY',
  'NDAY',
  'EXIST',
  'EVERY',
  'LAST',
  'NOT',
] as const);

const SELECTION_FUNCTIONS = Object.freeze([
  'IF',
  'IFF',
  'MAX',
  'MIN',
] as const);

const MATH_FUNCTIONS = Object.freeze([
  'MAX',
  'MIN',
  'ACOS',
  'ASIN',
  'ATAN',
  'COS',
  'SIN',
  'TAN',
  'EXP',
  'LN',
  'LOG',
  'SQRT',
  'ABS',
  'SIGN',
  'MOD',
  'POW',
  'CEILING',
  'INTPART',
  'FLOOR',
  'BETWEEN',
  'FRACPART',
  'ROUND',
  'ROUND2',
  'RAND',
] as const);

const STATS_FUNCTIONS = Object.freeze([
  'VALUEWHEN',
  'MA',
  'EMA',
  'SMA',
  'MEMA',
  'TMA',
  'AMA',
  'KAMA',
  'EXPMEMA',
  'HHV',
  'LLV',
  'SUM',
  'COUNT',
  'EVERY',
  'EXIST',
  'LAST',
  'FILTER',
  'TFILTER',
  'UPNDAY',
  'DOWNNDAY',
  'NDAY',
  'STD',
  'WMA',
  'DMA',
  'AVEDEV',
  'VAR',
  'VARP',
  'STDP',
  'DEVSQ',
  'COVAR',
  'CORR',
  'RELATE',
  'VOLAT',
  'BETA',
  'SLOPE',
  'FORCAST',
  'RSI',
  'BOLL_MID',
  'BOLL_UPPER',
  'BOLL_LOWER',
] as const);

const SHAPE_FUNCTIONS = Object.freeze([
  'SAR',
  'SARTURN',
  'ZIG',
  'ZIGA',
  'PEAK',
  'PEAKBARS',
  'TROUGH',
  'TROUGHBARS',
] as const);

const DRAWING_FUNCTIONS = Object.freeze([
  'DRAWICON',
  'DRAWTEXT',
  'DRAWNUMBER',
  'STICKLINE',
  'DRAWLINE',
  'DRAWSL',
  'DRAWKLINE',
  'FILLRGN',
  'DRAWBAND',
] as const);

const LINE_AND_COLOR_FUNCTIONS = Object.freeze([
  'COLORRED',
  'COLORGREEN',
  'COLORBLUE',
  'COLORYELLOW',
  'COLORWHITE',
  'COLORBLACK',
  'COLORCYAN',
  'COLORMAGENTA',
  'COLORGRAY',
  'COLORGREY',
  'COLORPURPLE',
  'COLORORANGE',
  'LINETHICK0',
  'LINETHICK1',
  'LINETHICK2',
  'LINETHICK3',
  'LINETHICK4',
  'LINETHICK5',
  'LINETHICK6',
  'LINETHICK7',
  'LINETHICK8',
  'LINETHICK9',
  'DOTLINE',
  'STICK',
  'NODRAW',
  'COLOR[0-9A-F]{6}',
  'LINETHICK{N}',
] as const);

const OPERATOR_FUNCTIONS = Object.freeze([
  '+',
  '-',
  '*',
  '/',
  '%',
  '^',
  '>',
  '>=',
  '<',
  '<=',
  '=',
  '<>',
  'AND',
  'OR',
  'NOT',
  ':=',
  ':',
  ',',
  '(',
  ')',
] as const);

const FUTU_DATA_SCOPE_BLOCKED_FUNCTIONS = Object.freeze({
  quote: Object.freeze([
    { name: 'OPTVOL', reason: 'REQUIRES_OPTIONS_CHAIN' },
    { name: 'OPTVOLPCR', reason: 'REQUIRES_OPTIONS_CHAIN' },
    { name: 'OPTOI', reason: 'REQUIRES_OPTIONS_CHAIN' },
    { name: 'OPTOIPCR', reason: 'REQUIRES_OPTIONS_CHAIN' },
  ] as const),
  time: Object.freeze([] as const),
  reference: Object.freeze([
    { name: 'ZTPRICE', reason: 'REQUIRES_EXCHANGE_LIMIT_RULES' },
    { name: 'DTPRICE', reason: 'REQUIRES_EXCHANGE_LIMIT_RULES' },
  ] as const),
  logic: Object.freeze([] as const),
  selection: Object.freeze([] as const),
  math: Object.freeze([] as const),
  stats: Object.freeze([
    { name: 'IV', reason: 'REQUIRES_OPTIONS_CHAIN' },
    { name: 'IVRANK', reason: 'REQUIRES_OPTIONS_CHAIN' },
  ] as const),
  shape: Object.freeze([] as const),
  drawing: Object.freeze([] as const),
  lineAndColor: Object.freeze([] as const),
  operator: Object.freeze([] as const),
} satisfies Readonly<Record<FutuSupportCategoryKey, readonly Readonly<{ name: string; reason: FutuDataScopeBlockReason }>[]>>);

const EXTRA_CALLABLE_CAPABILITIES = Object.freeze([
  { name: 'LOG10', categoryKey: 'math', callable: true },
  { name: 'LOG2', categoryKey: 'math', callable: true },
  { name: 'INT', categoryKey: 'math', callable: true },
  { name: 'SGN', categoryKey: 'math', callable: true },
  { name: 'CROSSUP', categoryKey: 'logic', callable: true },
  { name: 'CROSSDOWN', categoryKey: 'logic', callable: true },
  { name: 'DIFF', categoryKey: 'reference', callable: true },
  { name: 'ZIGZAG', categoryKey: 'shape', callable: true },
  { name: 'AND', categoryKey: 'operator', callable: true },
  { name: 'OR', categoryKey: 'operator', callable: true },
  { name: 'TRUE', categoryKey: 'reference', callable: true },
  { name: 'FALSE', categoryKey: 'reference', callable: true },
  { name: 'NULL', categoryKey: 'reference', callable: true },
  { name: 'INPUT', categoryKey: 'reference', callable: true },
] as const satisfies readonly RawCapabilitySeed[]);

const CATEGORY_DEFINITIONS = Object.freeze([
  { key: 'quote', callable: true, names: QUOTE_FUNCTIONS },
  { key: 'time', callable: true, names: TIME_FUNCTIONS },
  { key: 'reference', callable: true, names: REFERENCE_FUNCTIONS },
  { key: 'logic', callable: true, names: LOGIC_FUNCTIONS },
  { key: 'selection', callable: true, names: SELECTION_FUNCTIONS },
  { key: 'math', callable: true, names: MATH_FUNCTIONS },
  { key: 'stats', callable: true, names: STATS_FUNCTIONS },
  { key: 'shape', callable: true, names: SHAPE_FUNCTIONS },
  { key: 'drawing', callable: true, names: DRAWING_FUNCTIONS },
  { key: 'lineAndColor', callable: false, names: LINE_AND_COLOR_FUNCTIONS },
  { key: 'operator', callable: false, names: OPERATOR_FUNCTIONS },
] as const satisfies readonly Readonly<{
  key: FutuSupportCategoryKey;
  callable: boolean;
  names: readonly string[];
}>[]);

const BASE_CAPABILITY_SEEDS: RawCapabilitySeed[] = CATEGORY_DEFINITIONS.flatMap((category) => [
  ...category.names.map((name) => ({
    name,
    categoryKey: category.key,
    callable: category.callable,
    renderImplemented:
      category.key === 'drawing' ? !UNSUPPORTED_DRAWING_NAMES.has(name) : true,
  })),
  ...FUTU_DATA_SCOPE_BLOCKED_FUNCTIONS[category.key].map((entry) => ({
    name: entry.name,
    categoryKey: category.key,
    callable: category.callable,
    dataScopeBlockedReason: entry.reason,
    runtimeImplemented: false,
    renderImplemented: false,
  })),
]);

const ALL_CAPABILITY_SEEDS: readonly RawCapabilitySeed[] = Object.freeze([
  ...BASE_CAPABILITY_SEEDS,
  ...EXTRA_CALLABLE_CAPABILITIES.map((seed) => ({
    ...seed,
    matrixTargetIncluded: false,
    renderImplemented: true,
  })),
]);

const toSupportState = (
  syntaxAccepted: boolean,
  runtimeImplemented: boolean,
  renderImplemented: boolean,
  blockedReason: FutuDataScopeBlockReason | null,
): FutuCapabilitySupportState => {
  if (!syntaxAccepted || !runtimeImplemented) {
    return blockedReason ? 'blocked-data-scope' : 'unsupported';
  }
  if (!renderImplemented) {
    return 'unsupported';
  }
  return 'full';
};

export const FUTU_CAPABILITY_ENTRIES: readonly FutuCapabilityEntry[] = Object.freeze(
  ALL_CAPABILITY_SEEDS.map((seed) => {
    const syntaxAccepted = seed.syntaxAccepted ?? true;
    const runtimeImplemented =
      seed.runtimeImplemented ?? (seed.dataScopeBlockedReason ? false : true);
    const renderImplemented =
      seed.renderImplemented ??
      (seed.categoryKey === 'drawing' ? false : true);
    const blockedReason = seed.dataScopeBlockedReason ?? null;
    return {
      name: seed.name.trim().toUpperCase(),
      categoryKey: seed.categoryKey,
      callable: seed.callable,
      syntaxAccepted,
      runtimeImplemented,
      renderImplemented,
      dataScopeBlockedReason: blockedReason,
      matrixTargetIncluded: seed.matrixTargetIncluded ?? true,
      supportState: toSupportState(
        syntaxAccepted,
        runtimeImplemented,
        renderImplemented,
        blockedReason,
      ),
    } satisfies FutuCapabilityEntry;
  }),
);

export const FUTU_CAPABILITY_ENTRY_BY_NAME: ReadonlyMap<string, FutuCapabilityEntry> =
  (() => {
    const map = new Map<string, FutuCapabilityEntry>();
    FUTU_CAPABILITY_ENTRIES.forEach((entry) => {
      map.set(entry.name, entry);
    });
    return map;
  })();

const FUTU_CALLABLE_FUNCTION_NAME_SET = new Set<string>(
  FUTU_CAPABILITY_ENTRIES
    .filter(
      (entry) =>
        entry.callable &&
        entry.syntaxAccepted &&
        entry.runtimeImplemented &&
        entry.renderImplemented,
    )
    .map((entry) => entry.name),
);

export const getFutuCapabilityByName = (name: string): FutuCapabilityEntry | null =>
  FUTU_CAPABILITY_ENTRY_BY_NAME.get(name.trim().toUpperCase()) ?? null;

export const resolveFutuSupportState = (name: string): FutuCapabilitySupportState =>
  getFutuCapabilityByName(name)?.supportState ?? 'unsupported';

export const getFutuCallableFunctionNameSet = (): ReadonlySet<string> =>
  FUTU_CALLABLE_FUNCTION_NAME_SET;

export const FUTU_VENDOR_FORMULA_ADAPTER: VendorFormulaAdapter = Object.freeze({
  vendorKey: 'FUTU',
  getCapabilityByName: getFutuCapabilityByName,
  getCallableFunctionNameSet: getFutuCallableFunctionNameSet,
  resolveSupportState: resolveFutuSupportState,
});

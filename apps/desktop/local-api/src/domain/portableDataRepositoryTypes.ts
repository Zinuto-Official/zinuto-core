// SPDX-License-Identifier: GPL-3.0-only

export type PortableSqlRange = {
  whereSql: string;
  values: readonly unknown[];
};

export type PortablePayloadTableName =
  | 'portable_export_manifest'
  | 'portable_export_settings'
  | 'portable_export_custom_indicators'
  | 'portable_export_notes'
  | 'portable_export_training_projects'
  | 'portable_export_special_training_sessions'
  | 'portable_export_special_training_questions'
  | 'portable_export_source_manifests'
  | 'portable_export_market_sources'
  | 'portable_export_market_instruments'
  | 'portable_export_market_bars'
  | 'portable_export_market_file_ledgers';

export type PortablePayloadInsertTableName = Exclude<
  PortablePayloadTableName,
  'portable_export_market_bars'
>;

export type PortablePayloadJsonRow = {
  payload_json?: unknown;
};

export type PortablePayloadMarketBarRow = {
  instrumentId: string;
  tsMs: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type PortableImportedMarketSourceRow = {
  id: string;
  name: string;
  sourceFolder: string;
  sourceFolderBookmarkId: string;
  importScopeStrategy: string | null;
  importScopeTopLevelSubfolder: string;
  timeZone: string;
  timeZoneOrigin: string;
  baseTimeframe: string;
  fieldMappingJson: string;
  tradingCalendarJson: string;
  status: string;
  totalFiles: number;
  importedFiles: number;
  failedFiles: number;
  symbolCount: number;
  barCount: number;
  storageBytes: number;
  timeStartTs: string | null;
  timeEndTs: string | null;
  lastJobId: string;
  createdAt: string;
  updatedAt: string;
};

export type PortableImportedMarketJobRow = {
  id: string;
  sourceId: string;
  sourceName: string;
  timeZone: string;
  baseTimeframe: string;
  totalFiles: number;
  doneFiles: number;
  totalRows: number;
  importedRows: number;
  createdAt: string;
  startedAt: string;
  finishedAt: string;
  updatedAt: string;
};

export type PortableLocalInstrumentBindingRow = {
  id?: unknown;
  bars_version_token?: unknown;
};

export type PortableLocalInstrumentInsertRow = {
  id: string;
  sourceId: string;
  symbol: string;
  baseTimeframe: string;
  name: string;
  market: string;
  timeZone: string | null;
  minTradeStep: number;
  barCount: number;
  timeStartTs: string | null;
  timeEndTs: string | null;
  barsVersionToken: string;
  createdAt: string;
};

export type PortableLocalInstrumentBarsUpdateRow = {
  id: string;
  barsVersionToken: string;
  barCount: number;
  timeStartTs: string | null;
  timeEndTs: string | null;
};

export type PortableImportRecoveryJournalState =
  | 'PENDING'
  | 'MARKET_READY'
  | 'COMMITTED';

export type PortableImportRecoveryJournal = {
  id: string;
  state: PortableImportRecoveryJournalState;
  createdSourceIds: string[];
  createdInstrumentIds: string[];
  claimedSourceIds: string[];
  recoveryAttempts: number;
  lastRecoveryError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PortableImportedMarketFileLedgerRow = {
  id: string;
  sourceId: string;
  jobId: string;
  instrumentId: string | null;
  symbol: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  fileMtimeMs: number;
  fileFingerprint: string;
  rowsTotal: number;
  rowsImported: number;
  rowsSkipped: number;
  createdAt: string;
  updatedAt: string;
};

export type PortableCustomIndicatorProfileUpsertRow = {
  id: string;
  name: string;
  source: string;
  parameterInputsJson: string;
  revisionsJson: string;
  createdAt: string;
  updatedAt: string;
};

export type PortableTrainingProjectInsertRow = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  symbol: string;
  samplePoolId: string;
  samplePoolName: string;
  baseTimeframe: string;
  trainingDateRange: string;
  initialTotal: number;
  totalPnl: number;
  profitRate: number;
  durationDays: number;
  totalTrades: number;
  finalEquity: number;
  equityReturnRate: number;
  simulationBatchId: string | null;
  sourceTag: string;
  summaryJson: string;
  operatorSummaryJson: string;
};

export type PortableTrainingProjectReplayRefUpsertRow = {
  projectId: string;
  baseTimeframe: string;
  instrumentId: string;
  barsVersionToken: string;
  startTs: string | null;
  endTs: string | null;
  entryIndex: number;
  cursorIndex: number;
  historyBars: number;
  settingsJson: string;
  payloadBlob: Buffer | null;
  payloadEncoding: string;
  createdAt: string;
  updatedAt: string;
};

export type PortableTrainingProjectReplayFillUpsertRow = {
  projectId: string;
  fillIndex: number;
  rowSeq: number;
  side: 'BUY' | 'SELL';
  fillTime: string;
  fillPrice: number;
  fillQty: number;
  contractMultiplier: number;
  fee: number;
  tax: number;
  slippage: number;
  createdAt: string;
};

export type PortableTrainingProjectReplayCashAdjustmentUpsertRow = {
  projectId: string;
  barIndex: number;
  rowSeq: number;
  kind: 'LONG_FINANCING' | 'SHORT_BORROW' | 'FUNDING';
  amount: number;
  ts: string;
  createdAt: string;
};

export type PortableSpecialTrainingSessionInsertRow = {
  id: string;
  challengeId: string;
  bankId: string;
  bankName: string;
  modeId: string;
  simulationBatchId: string | null;
  sourceTag: string;
  timeframe: string;
  minimumBaseTimeframe: string;
  sourceTimeframe: string;
  questionCount: number;
  completedQuestionCount: number;
  passedQuestionCount: number;
  failedQuestionCount: number;
  missedQuestionCount: number;
  timedOutQuestionCount: number;
  decisionSecondsTotal: number;
  decisionSecondsAverage: number;
  maxConsecutivePasses: number;
  configJson: string;
  sessionSummaryJson: string;
  operatorSummaryJson: string;
  createdAt: string;
  finishedAt: string;
  updatedAt: string;
};

export type PortableSpecialTrainingQuestionInsertRow = {
  id: string;
  sessionId: string;
  questionOrder: number;
  modeId: string;
  sourceTag: string;
  symbol: string;
  baseTimeframe: string;
  effectiveTimeframe: string;
  minimumBaseTimeframe: string;
  instrumentId: string;
  barsVersionToken: string;
  windowStartTs: string | null;
  windowEndTs: string | null;
  windowBarCount: number;
  sourceWindowBarCount: number;
  startIndex: number;
  endIndex: number;
  minTradeStep: number;
  settlementStatus: string;
  score: number;
  passed: number;
  initialTotal: number;
  totalPnl: number;
  finalTotalAsset: number;
  returnRate: number;
  usedOperations: number;
  maxOperations: number;
  maxDrawdownRatio: number;
  performanceRate: number;
  grade: string;
  detailBlob: Buffer | null;
  detailEncoding: string;
  detailExpiredAt: string | null;
  createdAt: string;
  settledAt: string;
  updatedAt: string;
};

export type PortableReplayNoteInsertRow = {
  id: string;
  title: string;
  type: string;
  simulationBatchId: string | null;
  sourceKind: string | null;
  sourceId: string | null;
  contentPreview: string;
  trainingProjectId: string | null;
  contextDisplayPeriod: string | null;
  hasContextReplay: number;
  contextExpiredAt: string | null;
  contextSessionId: string | null;
  contextCursorIndex: unknown;
  createdAt: string;
  updatedAt: string;
};

export type PortableReplayNoteContentInsertRow = {
  noteId: string;
  documentSchemaVersion: number;
  documentEncoding: string;
  documentPayload: Buffer;
  documentHash: string;
  contentPreview: string;
  textChars: number;
  payloadBytes: number;
  updatedAt: string;
};

export type PortableReplayNoteAttachmentUpsertRow = {
  noteId: string;
  attachmentRefId: string;
  attachmentKind: string;
  summaryJson: string;
  refKind: string | null;
  refId: string | null;
  payloadEncoding: string | null;
  payloadBlob: Buffer | null;
  sourceBytes: number;
  payloadBytes: number;
  sortIndex: number;
  createdAt: string;
  updatedAt: string;
};

export type PortableReplayNoteMetaInsertRow = {
  noteId: string;
  metaJson: string;
  metaSummaryJson: string;
  createdAt: string;
  updatedAt: string;
};

export type PortableReplayNoteColorUpsertRow = {
  noteId: string;
  colorToken: string;
  sortIndex: number;
  createdAt: string;
  updatedAt: string;
};

export type PortableReplayNoteContextArchiveUpsertRow = {
  noteId: string;
  archiveEncoding: string;
  archivePayload: Buffer;
  sourceBytes: number;
  archiveBytes: number;
  createdAt: string;
  updatedAt: string;
};

export type PortableReplayNoteContextRefUpsertRow = {
  noteId: string;
  trainingProjectId: string;
  contextCursorIndex: number;
  windowBars: number;
  createdAt: string;
  updatedAt: string;
};

export type PortableReplayNoteSpecialTrainingContextRefUpsertRow = {
  noteId: string;
  questionId: string;
  createdAt: string;
  updatedAt: string;
};

export type PortableSettingsBundleRows = {
  userSettings: Record<string, unknown> | null;
  userAppPreferences: Record<string, unknown> | null;
};

export type PortableSourceManifestUpsertRow = {
  id: string;
  sourceId: string;
  sourceName: string;
  baseTimeframe: string;
  timeZone: string;
  symbolCount: number;
  barCount: number;
  timeStartTs: string | null;
  timeEndTs: string | null;
  fingerprintHash: string;
  createdAt: string;
  updatedAt: string;
};

export type PortableUserSettingsUpsertRow = {
  initialSecuritiesBalance: number;
  initialBankBalance: number;
  assetClass: string;
  marketPresetId: string;
  minTradeStep: number;
  commissionRate: number;
  makerFeeRate: number;
  takerFeeRate: number;
  fundingRate: number;
  contractMultiplier: number;
  transferFeeRate: number;
  regulatoryFeeRate: number;
  platformFeeRate: number;
  transactionLevyRate: number;
  slippageRate: number;
  stampDutyRate: number;
  commissionMinimumFee: number;
  platformFeeMinimumFee: number;
  transactionLevyMinimumFee: number;
  longFinancingAnnualRate: number;
  longInitialMarginRatio: number;
  longMaintenanceMarginRatio: number;
  shortBorrowAnnualRate: number;
  shortInitialMarginRatio: number;
  shortMaintenanceMarginRatio: number;
  stampDutyMode: string;
  stampDutySingleSide: string;
  positionCostMode: string;
  tradeSettlementMode: string;
  freeReplayEndSettlementMode: string;
  tradeAmountIncludesFees: number;
  allowLongMarginTrading: number;
  allowShortSelling: number;
  updatedAt: string;
};

export type PortableUserAppPreferencesUpsertRow = {
  uiSettingsJson: string;
  dataPoolRemovedSymbolsJson: string;
  updatedAt: string;
};

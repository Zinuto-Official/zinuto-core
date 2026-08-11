// SPDX-License-Identifier: GPL-3.0-only


export type ExportSettingsBundle = {
  userSettings: Record<string, unknown> | null;
  userAppPreferences: Record<string, unknown> | null;
};

export type ExportNoteBundle = {
  note: Record<string, unknown>;
  content: Record<string, unknown> | null;
  meta: Record<string, unknown> | null;
  colors: Record<string, unknown>[];
  attachments: Record<string, unknown>[];
  contextArchive: Record<string, unknown> | null;
};

export type ExportTrainingProjectBundle = {
  project: Record<string, unknown>;
  replayRef: Record<string, unknown> | null;
  replayFills: Record<string, unknown>[];
  replayCashAdjustments: Record<string, unknown>[];
  portablePreview: Record<string, unknown> | null;
  sourceManifestHash: string;
  exportSourceId: string;
  exportInstrumentId: string;
};

export type ExportSpecialTrainingSessionBundle = {
  session: Record<string, unknown>;
};

export type ExportSpecialTrainingQuestionBundle = {
  question: Record<string, unknown>;
  snapshotArchive: Record<string, unknown> | null;
  sourceManifestHash: string;
  exportSourceId: string;
  exportInstrumentId: string;
};

export type ExportMarketSourceBundle = {
  sourceId: string;
  sourceName: string;
  baseTimeframe: string;
  timeZone: string;
  timeZoneOrigin: string;
  importScopeStrategy: string | null;
  importScopeTopLevelSubfolder: string;
  fieldMappingJson: string;
  tradingCalendarJson: string;
  symbolCount: number;
  barCount: number;
  storageBytes: number;
  timeStartTs: string | null;
  timeEndTs: string | null;
  fingerprintHash: string;
  createdAt: string;
  updatedAt: string;
};

export type ExportMarketInstrumentBundle = {
  exportInstrumentId: string;
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

export type ExportMarketFileLedgerBundle = {
  sourceId: string;
  rowId: string;
  exportInstrumentId: string;
  symbol: string;
  fileName: string;
  relativePath: string;
  fileSize: number;
  fileMtimeMs: number;
  fileFingerprint: string;
  updatedAt: string;
};

export type PortableImportedReplayBinding = {
  instrumentId: string;
  barsVersionToken: string;
};

export type PortableNormalizedTrainingProject = {
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

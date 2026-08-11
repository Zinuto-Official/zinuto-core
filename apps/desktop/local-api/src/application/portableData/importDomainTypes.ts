// SPDX-License-Identifier: GPL-3.0-only

import type Database from "better-sqlite3";
import type {
  PortableExportDomain,
  PortableImportConflictMode,
  PortableImportSettingsConflictMode,
} from "../portableDataModel.js";
import type { importMarketDataFromPayload } from "./importMarketData.js";

export type ImportDomainContext = {
  payloadDb: Database.Database;
  selectedDomains: PortableExportDomain[];
  conflictMode: PortableImportConflictMode;
  settingsConflictMode: PortableImportSettingsConflictMode;
  marketImport: Awaited<ReturnType<typeof importMarketDataFromPayload>>;
  onBeforeTransactionCommit?: () => void;
};

export type ImportDomainResult = {
  importedCountByDomain: Partial<Record<PortableExportDomain, number>>;
  skippedCountByDomain: Partial<Record<PortableExportDomain, number>>;
  conflictCountByDomain: Partial<Record<PortableExportDomain, number>>;
  projectIdMap: Map<string, string>;
  specialSessionIdMap: Map<string, string>;
  questionIdMap: Map<string, string>;
  remappedNotes: number;
  remappedTrainingProjects: number;
  remappedSpecialSessions: number;
  remappedSpecialQuestions: number;
  rebind: {
    trainingProjectRefsUpdated: number;
    specialTrainingQuestionsUpdated: number;
  };
};

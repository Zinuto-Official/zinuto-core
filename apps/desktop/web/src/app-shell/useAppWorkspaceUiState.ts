// SPDX-License-Identifier: GPL-3.0-only

import type { PendingCsvFolderImport } from "@/domains/data-import/dataSourceTypes";
import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { reportMainWebviewBusy } from "@/api";
import {
  readMainDesktopViewportState,
  type ApiResetAllStoredDataJob,
  type ApiSystemStorageUsage,
  type DesktopViewportLayoutMode,
} from '@/api';
import type { CsvFieldMapping } from '@/domains/data-import/csvHelpers';
import type {
  UiSettings
} from "@/frontend-kernel/appTypes";
import type { WorkspacePage } from '@/frontend-kernel/workspacePageModel';
import {
  getDesktopOnboardingMainPage,
  normalizeDesktopOnboardingPersistedTourStatus,
  normalizeDesktopOnboardingTourStep,
  type DesktopOnboardingTourStatus,
  type DesktopOnboardingTourStep,
} from '@/domains/onboarding/desktopOnboardingModel';

type UseAppWorkspaceUiStateArgs = {
  persistedUi: UiSettings;
};

type UseAppWorkspaceUiStateResult = {
  activePage: WorkspacePage;
  setActivePage: Dispatch<SetStateAction<WorkspacePage>>;
  onboardingTourStatus: DesktopOnboardingTourStatus;
  setOnboardingTourStatus: Dispatch<SetStateAction<DesktopOnboardingTourStatus>>;
  onboardingTourStep: DesktopOnboardingTourStep;
  setOnboardingTourStep: Dispatch<SetStateAction<DesktopOnboardingTourStep>>;
  systemStorageUsage: ApiSystemStorageUsage | null;
  setSystemStorageUsage: Dispatch<SetStateAction<ApiSystemStorageUsage | null>>;
  isSystemStorageUsageLoading: boolean;
  setIsSystemStorageUsageLoading: Dispatch<SetStateAction<boolean>>;
  isGlobalResetProgressVisible: boolean;
  setIsGlobalResetProgressVisible: Dispatch<SetStateAction<boolean>>;
  globalResetProgressLabel: string;
  setGlobalResetProgressLabel: Dispatch<SetStateAction<string>>;
  globalResetProgressPercent: number;
  setGlobalResetProgressPercent: Dispatch<SetStateAction<number>>;
  globalResetProgressTargetPercent: number;
  setGlobalResetProgressTargetPercent: Dispatch<SetStateAction<number>>;
  setGlobalResetModules: Dispatch<SetStateAction<ApiResetAllStoredDataJob['modules']>>;
  selectedReplayNoteId: string;
  setSelectedReplayNoteId: Dispatch<SetStateAction<string>>;
  replayNotesKeyword: string;
  setReplayNotesKeyword: Dispatch<SetStateAction<string>>;
  activeTrainingRecordNoteId: string;
  setActiveTrainingRecordNoteId: Dispatch<SetStateAction<string>>;
  editingProjectId: string;
  setEditingProjectId: Dispatch<SetStateAction<string>>;
  editingProjectName: string;
  setEditingProjectName: Dispatch<SetStateAction<string>>;
  editingSamplePoolId: string;
  setEditingSamplePoolId: Dispatch<SetStateAction<string>>;
  editingSamplePoolName: string;
  setEditingSamplePoolName: Dispatch<SetStateAction<string>>;
  historyListCompact: boolean;
  setHistoryListCompact: Dispatch<SetStateAction<boolean>>;
  viewportScale: number;
  setViewportScale: Dispatch<SetStateAction<number>>;
  viewportLayoutMode: DesktopViewportLayoutMode;
  setViewportLayoutMode: Dispatch<SetStateAction<DesktopViewportLayoutMode>>;
  pendingCsvFolderImport: PendingCsvFolderImport | null;
  setPendingCsvFolderImport: Dispatch<SetStateAction<PendingCsvFolderImport | null>>;
  pendingCsvFieldMapping: CsvFieldMapping | null;
  setPendingCsvFieldMapping: Dispatch<SetStateAction<CsvFieldMapping | null>>;
  isCsvImporting: boolean;
  setIsCsvImporting: Dispatch<SetStateAction<boolean>>;
  deletingSamplePoolId: string;
  setDeletingSamplePoolId: Dispatch<SetStateAction<string>>;
  deletingSamplePoolProgressPercent: number;
  setDeletingSamplePoolProgressPercent: Dispatch<SetStateAction<number>>;
  deletingSamplePoolProgressTargetPercent: number;
  setDeletingSamplePoolProgressTargetPercent: Dispatch<SetStateAction<number>>;
  isClearingLocalDataSources: boolean;
  setIsClearingLocalDataSources: Dispatch<SetStateAction<boolean>>;
  clearingLocalDataSourcesProgressPercent: number;
  setClearingLocalDataSourcesProgressPercent: Dispatch<SetStateAction<number>>;
  clearingLocalDataSourcesProgressTargetPercent: number;
  setClearingLocalDataSourcesProgressTargetPercent: Dispatch<SetStateAction<number>>;
  replayUnavailableMessage: string;
  setReplayUnavailableMessage: Dispatch<SetStateAction<string>>;
  isBusy: boolean;
  setIsBusy: Dispatch<SetStateAction<boolean>>;
};

export const useAppWorkspaceUiState = ({ persistedUi }: UseAppWorkspaceUiStateArgs): UseAppWorkspaceUiStateResult => {
  const initialOnboardingTourStatus = normalizeDesktopOnboardingPersistedTourStatus(
    persistedUi.onboardingTourStatus,
  );
  const initialOnboardingTourStep = normalizeDesktopOnboardingTourStep(
    persistedUi.onboardingTourStep,
  );
  const initialDesktopViewport = readMainDesktopViewportState();
  const [onboardingTourStatus, setOnboardingTourStatus] =
    useState<DesktopOnboardingTourStatus>(initialOnboardingTourStatus);
  const [onboardingTourStep, setOnboardingTourStep] =
    useState<DesktopOnboardingTourStep>(initialOnboardingTourStep);
  const [activePage, setActivePage] = useState<WorkspacePage>(
    initialOnboardingTourStatus === 'ACTIVE'
      ? getDesktopOnboardingMainPage(initialOnboardingTourStep) ?? 'COMMAND_CENTER'
      : 'COMMAND_CENTER',
  );
  const [systemStorageUsage, setSystemStorageUsage] = useState<ApiSystemStorageUsage | null>(null);
  const [isSystemStorageUsageLoading, setIsSystemStorageUsageLoading] = useState(false);
  const [isGlobalResetProgressVisible, setIsGlobalResetProgressVisible] = useState(false);
  const [globalResetProgressLabel, setGlobalResetProgressLabel] = useState('');
  const [globalResetProgressPercent, setGlobalResetProgressPercent] = useState(0);
  const [globalResetProgressTargetPercent, setGlobalResetProgressTargetPercent] = useState(0);
  // No module reads the global-reset modules value; keep the setter as a stable
  // no-op so consumers can keep broadcasting progress without wasted state.
  const setGlobalResetModules = useCallback<
    Dispatch<SetStateAction<ApiResetAllStoredDataJob['modules']>>
  >(() => undefined, []);
  const [selectedReplayNoteId, setSelectedReplayNoteId] = useState('');
  const [replayNotesKeyword, setReplayNotesKeyword] = useState('');
  const [activeTrainingRecordNoteId, setActiveTrainingRecordNoteId] = useState('');
  const [editingProjectId, setEditingProjectId] = useState('');
  const [editingProjectName, setEditingProjectName] = useState('');
  const [editingSamplePoolId, setEditingSamplePoolId] = useState('');
  const [editingSamplePoolName, setEditingSamplePoolName] = useState('');
  const [historyListCompact, setHistoryListCompact] = useState(false);
  const [viewportScale, setViewportScale] = useState(
    initialDesktopViewport.cssViewportScale,
  );
  const [viewportLayoutMode, setViewportLayoutMode] =
    useState<DesktopViewportLayoutMode>(initialDesktopViewport.layoutMode);
  const [pendingCsvFolderImport, setPendingCsvFolderImport] = useState<PendingCsvFolderImport | null>(null);
  const [pendingCsvFieldMapping, setPendingCsvFieldMapping] = useState<CsvFieldMapping | null>(null);
  const [isCsvImporting, setIsCsvImporting] = useState(false);
  const [deletingSamplePoolId, setDeletingSamplePoolId] = useState('');
  const [deletingSamplePoolProgressPercent, setDeletingSamplePoolProgressPercent] = useState(0);
  const [deletingSamplePoolProgressTargetPercent, setDeletingSamplePoolProgressTargetPercent] = useState(0);
  const [isClearingLocalDataSources, setIsClearingLocalDataSources] = useState(false);
  const [clearingLocalDataSourcesProgressPercent, setClearingLocalDataSourcesProgressPercent] = useState(0);
  const [clearingLocalDataSourcesProgressTargetPercent, setClearingLocalDataSourcesProgressTargetPercent] = useState(0);
  const [replayUnavailableMessage, setReplayUnavailableMessage] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  const isKnownLongOperationActive =
    isBusy ||
    isGlobalResetProgressVisible ||
    isClearingLocalDataSources ||
    deletingSamplePoolProgressPercent > 0;
  useEffect(() => {
    reportMainWebviewBusy(isKnownLongOperationActive);
  }, [isKnownLongOperationActive]);

  return {
    activePage,
    setActivePage,
    onboardingTourStatus,
    setOnboardingTourStatus,
    onboardingTourStep,
    setOnboardingTourStep,
    systemStorageUsage,
    setSystemStorageUsage,
    isSystemStorageUsageLoading,
    setIsSystemStorageUsageLoading,
    isGlobalResetProgressVisible,
    setIsGlobalResetProgressVisible,
    globalResetProgressLabel,
    setGlobalResetProgressLabel,
    globalResetProgressPercent,
    setGlobalResetProgressPercent,
    globalResetProgressTargetPercent,
    setGlobalResetProgressTargetPercent,
    setGlobalResetModules,
    selectedReplayNoteId,
    setSelectedReplayNoteId,
    replayNotesKeyword,
    setReplayNotesKeyword,
    activeTrainingRecordNoteId,
    setActiveTrainingRecordNoteId,
    editingProjectId,
    setEditingProjectId,
    editingProjectName,
    setEditingProjectName,
    editingSamplePoolId,
    setEditingSamplePoolId,
    editingSamplePoolName,
    setEditingSamplePoolName,
    historyListCompact,
    setHistoryListCompact,
    viewportScale,
    setViewportScale,
    viewportLayoutMode,
    setViewportLayoutMode,
    pendingCsvFolderImport,
    setPendingCsvFolderImport,
    pendingCsvFieldMapping,
    setPendingCsvFieldMapping,
    isCsvImporting,
    setIsCsvImporting,
    deletingSamplePoolId,
    setDeletingSamplePoolId,
    deletingSamplePoolProgressPercent,
    setDeletingSamplePoolProgressPercent,
    deletingSamplePoolProgressTargetPercent,
    setDeletingSamplePoolProgressTargetPercent,
    isClearingLocalDataSources,
    setIsClearingLocalDataSources,
    clearingLocalDataSourcesProgressPercent,
    setClearingLocalDataSourcesProgressPercent,
    clearingLocalDataSourcesProgressTargetPercent,
    setClearingLocalDataSourcesProgressTargetPercent,
    replayUnavailableMessage,
    setReplayUnavailableMessage,
    isBusy,
    setIsBusy
  };
};

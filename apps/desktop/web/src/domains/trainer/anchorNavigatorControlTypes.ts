// SPDX-License-Identifier: GPL-3.0-only

import type {
  Dispatch,
  KeyboardEvent,
  MutableRefObject,
  ReactNode,
  RefObject,
  SetStateAction,
} from "react";
import type { UiLanguage } from "@/frontend-kernel/typography";
import type {
  FreeReplayAdvancePeriod,
  FreeReplayStartPointOverviewRange,
} from "@/domains/training/types";
import type {
  BaseTimeframe,
  DisplayPeriodKey,
} from "@/domains/trainer/trainerTypes";
import type {
  AnchorNavigatorChromeModel,
  AnchorNavigatorCommitMode,
  AnchorNavigatorVariant,
} from "@/domains/trainer/anchorNavigatorVariant";

export type AnchorOverviewBar = {
  index: number;
  applyAnchorIndex: number;
  displayPeriod: DisplayPeriodKey;
  startRawIndex: number;
  endRawIndex: number;
  startTrainingIndex: number;
  endTrainingIndex: number;
  ts: string;
  startTs: string;
  endTs: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type AnchorOverviewWindow = {
  offset: number;
  total: number;
  trainingTotal: number;
  displayPeriod: DisplayPeriodKey;
  bars: AnchorOverviewBar[];
  isComplete: boolean;
};

export type ViewMode = "CALENDAR" | "MAP";
export type TimeTone = "up" | "down" | "flat";
export type WeekStartMode = "MONDAY" | "SATURDAY" | "SUNDAY";
export type AnchorNavigatorControlProps = {
  samplePoolId: string;
  instrumentId: string;
  symbol: string;
  sourceTimeframe: BaseTimeframe;
  effectiveTimeframe: FreeReplayAdvancePeriod;
  language: UiLanguage;
  themeMode: "light" | "dark";
  currentTotalBars?: number | null;
  currentRawAnchorIndex?: number | null;
  currentAnchorOverviewIndex: number | null;
  currentAnchorTs: string | null;
  isActive?: boolean;
  isDisabled?: boolean;
  isBusy?: boolean;
  variant?: AnchorNavigatorVariant;
  commitMode?: AnchorNavigatorCommitMode;
  displayMode?: "full" | "history-preview";
  onPreviewStatusChange?: (
    status: {
      progressText: string;
      remainingText: string;
      anchorText: string;
    } | null,
  ) => void;
  getOverviewRange: (
    instrumentId: string,
    samplePoolId: string | undefined,
    minimumBaseTimeframe: FreeReplayAdvancePeriod,
    offset?: number,
    limit?: number,
    range?: {
      rawStartIndex?: number;
      rawEndIndex?: number;
      displayPeriod?: DisplayPeriodKey;
    },
  ) => Promise<FreeReplayStartPointOverviewRange>;
  onApplyAnchor: (selection: {
    overviewIndex: number;
    rawAnchorIndex: number;
    anchorTs: string | null;
  }) => Promise<void>;
  ui: {
    startPoint: string;
    dateRange: string;
    chartSettings: string;
  };
};

export type DayBucket = {
  date: string;
  startIndex: number;
  endIndex: number;
  displayPeriod: DisplayPeriodKey;
  startRawIndex: number;
  endRawIndex: number;
  count: number;
  anchorIndexes: number[];
};

export type CalendarDayCell = {
  key: string;
  dateKey: string | null;
  day: number | null;
  bucket: DayBucket | null;
  inMonth: boolean;
};

export type CalendarMonthModel = {
  month: number;
  title: string;
  cells: CalendarDayCell[];
  hasAnyData: boolean;
};

export type IntradayDayListItem = {
  bucket: DayBucket;
  label: string;
  supportText: string;
  countText: string;
};

export type AnchorNavigatorDayTimeOption = {
  index: number;
  label: string;
  closeText: string;
  tone: TimeTone;
};

export type AnchorNavigatorPreviewStats = {
  historyBars: number;
  remainingBars: number;
  totalBars: number;
};

export type AnchorNavigatorControlViewModel = {
  activeMonthLabel: string;
  activeStatusPointerIdRef: MutableRefObject<number | null>;
  activeYear: number | null;
  availableYears: number[];
  barMap: Map<number, AnchorOverviewBar>;
  calendarTabLabel: string;
  canInteract: boolean;
  chrome: AnchorNavigatorChromeModel;
  commitAnchorTarget: (target: AnchorOverviewBar | null) => void;
  commitMode: AnchorNavigatorCommitMode;
  committedAnchorIndex: number | null;
  currentWindowAnchorRatio: number;
  dayBuckets: DayBucket[];
  dayTimeOptions: AnchorNavigatorDayTimeOption[];
  effectiveAnchorBar: AnchorOverviewBar | null;
  effectiveAnchorDateKey: string;
  effectiveAnchorSourceWindow: AnchorOverviewWindow | null;
  effectiveInstrumentId: string;
  effectiveTimeframe: FreeReplayAdvancePeriod;
  effectiveViewMode: ViewMode;
  handleApply: () => Promise<void>;
  handleCancel: () => void;
  handleStatusTrackKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  hasDraftAnchorSelection: boolean;
  hasIntraday: boolean;
  intradayDayListItems: IntradayDayListItem[];
  isApplying: boolean;
  isBusy: boolean;
  isDisabled: boolean;
  isEmbedded: boolean;
  isHistoryPreview: boolean;
  isLoading: boolean;
  isPanelVisible: boolean;
  isReplayableLeafAnchorBar: (
    bar: AnchorOverviewBar | null | undefined,
    sourceOverview: AnchorOverviewWindow | null,
  ) => boolean;
  isStartPointDisplayPeriodCoarser: (
    displayPeriod: DisplayPeriodKey,
    effectiveTimeframe: FreeReplayAdvancePeriod,
  ) => boolean;
  isStatusDraggingRef: MutableRefObject<boolean>;
  isWindowTruncated: boolean;
  language: UiLanguage;
  loadError: string;
  loadingLabel: string;
  mapBars: AnchorOverviewBar[];
  mapCanvasRef: RefObject<HTMLDivElement | null>;
  mapCursorHandleRef: RefObject<HTMLDivElement | null>;
  maxDayCount: number;
  monthPickerOpen: boolean;
  noneLabel: string;
  onPreviewStatusChange: AnchorNavigatorControlProps["onPreviewStatusChange"];
  open: boolean;
  overview: AnchorOverviewWindow | null;
  panelAlignOffset: number;
  previewAnchorTarget: (target: AnchorOverviewBar | null) => void;
  previewStats: AnchorNavigatorPreviewStats;
  progressText: string;
  remainingText: string;
  requestDialogClose: (() => void) | null | undefined;
  resolveNearestMapSampleIndex: (trainingIndex: number) => number;
  resolveStatusTrackAnchorByClientPoint: (
    clientX: number,
    host: HTMLElement,
  ) => AnchorOverviewBar | null;
  rootOverview: AnchorOverviewWindow | null;
  selectedAnchorIndex: number | null;
  selectedDateKey: string;
  selectedDayBucket: DayBucket | null;
  selectedMonthModel: CalendarMonthModel | null;
  selectedYearIndex: number;
  selectedYearMonths: CalendarMonthModel[];
  setDraftAnchorBar: Dispatch<SetStateAction<AnchorOverviewBar | null>>;
  setHasDraftAnchorSelection: Dispatch<SetStateAction<boolean>>;
  setMonthPickerOpen: Dispatch<SetStateAction<boolean>>;
  setOpen: Dispatch<SetStateAction<boolean>>;
  setSelectedAnchorIndex: Dispatch<SetStateAction<number | null>>;
  setSelectedDateKey: Dispatch<SetStateAction<string>>;
  setSelectedMonth: Dispatch<SetStateAction<number | null>>;
  setSelectedYear: Dispatch<SetStateAction<number | null>>;
  setViewMode: Dispatch<SetStateAction<ViewMode>>;
  setWeekStartPickerOpen: Dispatch<SetStateAction<boolean>>;
  setYearPickerOpen: Dispatch<SetStateAction<boolean>>;
  statusTrackRef: RefObject<HTMLDivElement | null>;
  themeMode: "light" | "dark";
  triggerAnchorText: string;
  triggerLabel: string;
  ui: AnchorNavigatorControlProps["ui"];
  viewMode: ViewMode;
  weekStartControl: ReactNode;
  weekStartPrefixLabel: string;
  weekdayLabels: string[];
  windowTruncatedText: string;
  yearPickerOpen: boolean;
};

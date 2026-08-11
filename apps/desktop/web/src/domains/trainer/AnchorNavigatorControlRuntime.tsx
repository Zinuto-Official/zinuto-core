// SPDX-License-Identifier: GPL-3.0-only

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button } from "@/ui/primitives/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/ui/primitives/dropdown-menu";
import { SegmentedControl } from "@/ui/primitives/segmented-control";
import { VendorIcon } from "@/assets/graphics";
import { formatMoney } from "@/ui/formatting/format";
import { ttf } from "@/frontend-kernel/i18n/messageRuntime";
import {
  buildVisibleMonthNumbersForYear,
  toYearFromDateKey,
} from "@/domains/trainer/anchorNavigatorCalendar";
import { useAnchorNavigatorDialog } from "@/domains/trainer/anchorNavigatorDialogContext";
import {
  resolveAnchorNavigatorChrome,
} from "@/domains/trainer/anchorNavigatorVariant";
import { formatMessage } from "@zinuto/shared/i18n";
import { isStartPointDisplayPeriodCoarser } from "@/domains/trainer/startPointOverviewDisplay";
import type {
  AnchorNavigatorControlProps,
  AnchorOverviewBar,
  AnchorOverviewWindow,
  CalendarDayCell,
  CalendarMonthModel,
  DayBucket,
  IntradayDayListItem,
  TimeTone,
  ViewMode,
  WeekStartMode,
} from "@/domains/trainer/anchorNavigatorControlTypes";
import {
  MAP_MAX_BARS,
  WEEKDAY_MS,
  WEEKDAY_SUNDAY_UTC_MS,
  WEEK_START_UTC_DAY,
  clamp,
  formatAnchorTs,
  formatDayListDateByLanguage,
  formatMonthShortByLanguage,
  formatTimeByLanguage,
  sampleBarsForMap,
  toDateKey,
  toMonthFromDateKey,
} from "@/domains/trainer/anchorNavigatorControlModel";
import { AnchorNavigatorControlView } from "@/domains/trainer/AnchorNavigatorControlView";
import { useAnchorNavigatorInteractions } from "@/domains/trainer/useAnchorNavigatorInteractions";
import { useAnchorNavigatorOverviewRuntime } from "@/domains/trainer/useAnchorNavigatorOverviewRuntime";

export { formatAnchorTs } from "@/domains/trainer/anchorNavigatorControlModel";

export const AnchorNavigatorControl = ({
  samplePoolId,
  instrumentId,
  symbol,
  sourceTimeframe,
  effectiveTimeframe,
  language,
  themeMode,
  currentRawAnchorIndex,
  currentAnchorOverviewIndex,
  currentAnchorTs,
  isActive = true,
  isDisabled = false,
  isBusy = false,
  variant = "dropdown",
  commitMode = "explicit",
  displayMode = "full",
  onPreviewStatusChange,
  getOverviewRange,
  onApplyAnchor,
  ui,
}: AnchorNavigatorControlProps) => {
  const [open, setOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("CALENDAR");
  const [isLoading, setIsLoading] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [panelAlignOffset, setPanelAlignOffset] = useState(0);
  const [yearPickerOpen, setYearPickerOpen] = useState(false);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [weekStartPickerOpen, setWeekStartPickerOpen] = useState(false);
  const [weekStartMode, setWeekStartMode] = useState<WeekStartMode>("MONDAY");
  const [rootOverview, setRootOverview] =
    useState<AnchorOverviewWindow | null>(null);
  const [activeWindow, setActiveWindow] =
    useState<AnchorOverviewWindow | null>(null);
  const [draftAnchorBar, setDraftAnchorBar] =
    useState<AnchorOverviewBar | null>(null);
  const [selectedAnchorIndex, setSelectedAnchorIndex] = useState<number | null>(
    null,
  );
  const [selectedDateKey, setSelectedDateKey] = useState("");
  const [hasDraftAnchorSelection, setHasDraftAnchorSelection] = useState(false);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const overviewCacheRef = useRef<Map<string, AnchorOverviewWindow>>(new Map());
  const lastObservedSelectedDateKeyRef = useRef("");
  const mapCanvasRef = useRef<HTMLDivElement | null>(null);
  const mapCursorHandleRef = useRef<HTMLDivElement | null>(null);
  const statusTrackRef = useRef<HTMLDivElement | null>(null);
  const mapBarsRef = useRef<AnchorOverviewBar[]>([]);
  const isMapDraggingRef = useRef(false);
  const isStatusDraggingRef = useRef(false);
  const activeStatusPointerIdRef = useRef<number | null>(null);
  const mapPointerRafRef = useRef(0);
  const loadRequestIdRef = useRef(0);
  const lastSyncedCurrentAnchorKeyRef = useRef("");
  const currentAnchorRef = useRef<{
    rawAnchorIndex: number | null;
    overviewIndex: number | null;
    ts: string | null;
  }>({
    rawAnchorIndex: currentRawAnchorIndex ?? null,
    overviewIndex: currentAnchorOverviewIndex,
    ts: currentAnchorTs,
  });
  const pendingMapPointerTargetRef = useRef<{
    target: AnchorOverviewBar;
    select: boolean;
    hover: boolean;
  } | null>(null);
  const chrome = resolveAnchorNavigatorChrome({ variant, commitMode });
  const { requestClose: requestDialogClose } = useAnchorNavigatorDialog();
  const isEmbedded = chrome.isEmbedded;
  const isHistoryPreview = displayMode === "history-preview";
  const isPanelVisible = isActive && (isEmbedded || open);
  const effectiveViewMode = isEmbedded ? ("CALENDAR" as ViewMode) : viewMode;
  const canInteract = isActive && !isDisabled && !isBusy;
  const overview = activeWindow;
  const effectiveSymbol = (symbol || "").trim().toUpperCase();
  const effectiveSamplePoolId = String(samplePoolId || "").trim();
  const effectiveInstrumentId = String(instrumentId || "").trim();
  const triggerAnchorText = formatAnchorTs(
    currentAnchorTs,
    language,
    effectiveTimeframe,
  );
  const noneLabel = formatMessage(language, "common.placeholder.none");
  const loadingLabel = formatMessage(language, "common.status.loading");
  const loadFailedLabel = formatMessage(language, "common.status.loadFailed");
  const {
    calendarTabLabel,
    currentAnchorSyncKey,
    hasIntraday,
    isReplayableLeafAnchorBar,
    loadDetailWindowForBucket,
    resolveAnchorInWindow,
    resolveNearestOverviewBarByTrainingIndex,
    resolveStatusTrackAnchorByClientPoint,
    triggerLabel,
    weekStartPrefixLabel,
  } = useAnchorNavigatorOverviewRuntime({
    currentAnchorOverviewIndex,
    currentAnchorRef,
    currentAnchorTs,
    currentRawAnchorIndex,
    effectiveInstrumentId,
    effectiveSamplePoolId,
    effectiveSymbol,
    effectiveTimeframe,
    getOverviewRange,
    isEmbedded,
    isMapDraggingRef,
    isPanelVisible,
    loadFailedLabel,
    loadRequestIdRef,
    onApplyAnchor,
    open,
    overviewCacheRef,
    rootOverview,
    setActiveWindow,
    setDraftAnchorBar,
    setHasDraftAnchorSelection,
    setIsLoading,
    setLoadError,
    setMonthPickerOpen,
    setPanelAlignOffset,
    setRootOverview,
    setSelectedAnchorIndex,
    setSelectedDateKey,
    setViewMode,
    setWeekStartPickerOpen,
    setYearPickerOpen,
    sourceTimeframe,
    triggerAnchorText,
  });
  const calendarOverview = overview;

  const dayBuckets = useMemo<DayBucket[]>(() => {
    if (!calendarOverview?.bars.length) {
      return [];
    }
    const bucketMap = new Map<string, DayBucket>();
    calendarOverview.bars.forEach((item) => {
      const date = toDateKey(item.ts);
      const existing = bucketMap.get(date);
      const trainingCount = Math.max(
        1,
        item.endTrainingIndex - item.startTrainingIndex + 1,
      );
      if (existing) {
        existing.endIndex = item.index;
        existing.endRawIndex = Math.max(existing.endRawIndex, item.endRawIndex);
        existing.count += trainingCount;
        existing.anchorIndexes.push(item.index);
        return;
      }
      bucketMap.set(date, {
        date,
        startIndex: item.index,
        endIndex: item.index,
        displayPeriod: item.displayPeriod,
        startRawIndex: item.startRawIndex,
        endRawIndex: item.endRawIndex,
        count: trainingCount,
        anchorIndexes: [item.index],
      });
    });
    return Array.from(bucketMap.values()).sort((a, b) =>
      b.date.localeCompare(a.date),
    );
  }, [calendarOverview]);

  const barMap = useMemo(() => {
    const map = new Map<number, AnchorOverviewBar>();
    overview?.bars.forEach((item) => {
      map.set(item.index, item);
    });
    return map;
  }, [overview]);

  const calendarBarMap = useMemo(() => {
    const map = new Map<number, AnchorOverviewBar>();
    calendarOverview?.bars.forEach((item) => {
      map.set(item.index, item);
    });
    return map;
  }, [calendarOverview]);

  const mapOverview = rootOverview ?? overview;
  const mapBars = useMemo(
    () => sampleBarsForMap(mapOverview?.bars ?? [], MAP_MAX_BARS),
    [mapOverview?.bars],
  );
  useEffect(() => {
    mapBarsRef.current = mapBars;
  }, [mapBars]);

  const dayBucketByDateKey = useMemo(() => {
    const map = new Map<string, DayBucket>();
    dayBuckets.forEach((item) => {
      map.set(item.date, item);
    });
    return map;
  }, [dayBuckets]);

  const resolveDayBucketForNavigationBar = useCallback(
    (target: AnchorOverviewBar): DayBucket | null =>
      dayBucketByDateKey.get(toDateKey(target.ts)) ??
      dayBuckets.find(
        (bucket) =>
          bucket.startRawIndex <= target.endRawIndex &&
          bucket.endRawIndex >= target.startRawIndex,
      ) ??
      null,
    [dayBucketByDateKey, dayBuckets],
  );

  const isRangeOverviewTarget = useCallback(
    (target: AnchorOverviewBar): boolean =>
      isStartPointDisplayPeriodCoarser(target.displayPeriod, effectiveTimeframe),
    [effectiveTimeframe],
  );

  useEffect(() => {
    if (!isPanelVisible || !rootOverview || !currentAnchorSyncKey) {
      return;
    }
    if (isMapDraggingRef.current || isStatusDraggingRef.current) {
      return;
    }
    const alreadySynced =
      lastSyncedCurrentAnchorKeyRef.current === currentAnchorSyncKey;
    if (alreadySynced && draftAnchorBar) {
      return;
    }
    const resolvedAnchor = resolveAnchorInWindow(rootOverview);
    if (!Number.isFinite(resolvedAnchor)) {
      return;
    }
    const anchorBar =
      rootOverview.bars[
        Math.max(0, Number(resolvedAnchor) - rootOverview.offset)
      ] ?? null;
    if (!anchorBar) {
      return;
    }
    lastSyncedCurrentAnchorKeyRef.current = currentAnchorSyncKey;
    setDraftAnchorBar(anchorBar);
    setHasDraftAnchorSelection(false);
    if (barMap.get(anchorBar.index) === anchorBar) {
      setSelectedAnchorIndex((current) =>
        current === anchorBar.index ? current : anchorBar.index,
      );
    }
    const nextDateKey = toDateKey(anchorBar.ts);
    setSelectedDateKey((current) =>
      current === nextDateKey ? current : nextDateKey,
    );
  }, [
    barMap,
    currentAnchorSyncKey,
    draftAnchorBar,
    isPanelVisible,
    resolveAnchorInWindow,
    rootOverview,
  ]);

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    dayBuckets.forEach((item) => {
      const year = toYearFromDateKey(item.date);
      if (year !== null) {
        years.add(year);
      }
    });
    return Array.from(years).sort((a, b) => a - b);
  }, [dayBuckets]);

  useEffect(() => {
    if (!selectedDateKey && dayBuckets.length) {
      setSelectedDateKey(dayBuckets[0].date);
    }
  }, [dayBuckets, selectedDateKey]);

  useEffect(() => {
    if (!availableYears.length) {
      if (selectedYear !== null) {
        setSelectedYear(null);
      }
      return;
    }
    const selectedDateYear = selectedDateKey
      ? toYearFromDateKey(selectedDateKey)
      : null;
    const targetYear =
      selectedDateYear !== null && availableYears.includes(selectedDateYear)
        ? selectedDateYear
        : availableYears[0];
    if (targetYear !== selectedYear) {
      setSelectedYear(targetYear);
    }
  }, [availableYears, selectedDateKey, selectedYear]);

  const selectedDayBucket = useMemo(
    () => dayBuckets.find((item) => item.date === selectedDateKey) ?? null,
    [dayBuckets, selectedDateKey],
  );

  const activeYear = selectedYear ?? availableYears[0] ?? null;

  const selectedYearIndex = useMemo(() => {
    if (activeYear === null) {
      return -1;
    }
    return availableYears.findIndex((item) => item === activeYear);
  }, [activeYear, availableYears]);

  const weekStartUtcDay = useMemo(
    () => WEEK_START_UTC_DAY[weekStartMode],
    [weekStartMode],
  );

  const formatWeekdayByUtcDay = useCallback(
    (utcDay: number): string => {
      const normalized = ((Math.floor(Number(utcDay) || 0) % 7) + 7) % 7;
      const date = new Date(WEEKDAY_SUNDAY_UTC_MS + normalized * WEEKDAY_MS);
      try {
        return new Intl.DateTimeFormat(language, {
          weekday: "short",
          timeZone: "UTC",
        }).format(date);
      } catch {
        return "";
      }
    },
    [language],
  );

  const weekStartOptions = useMemo(
    () => [
      {
        mode: "MONDAY" as const,
        utcDay: WEEK_START_UTC_DAY.MONDAY,
        label: formatWeekdayByUtcDay(WEEK_START_UTC_DAY.MONDAY),
      },
      {
        mode: "SATURDAY" as const,
        utcDay: WEEK_START_UTC_DAY.SATURDAY,
        label: formatWeekdayByUtcDay(WEEK_START_UTC_DAY.SATURDAY),
      },
      {
        mode: "SUNDAY" as const,
        utcDay: WEEK_START_UTC_DAY.SUNDAY,
        label: formatWeekdayByUtcDay(WEEK_START_UTC_DAY.SUNDAY),
      },
    ],
    [formatWeekdayByUtcDay],
  );

  const activeWeekStartLabel = useMemo(
    () =>
      weekStartOptions.find((item) => item.mode === weekStartMode)?.label ?? "",
    [weekStartMode, weekStartOptions],
  );

  const weekdayLabels = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) =>
        formatWeekdayByUtcDay((weekStartUtcDay + index) % 7),
      ),
    [formatWeekdayByUtcDay, weekStartUtcDay],
  );

  const weekStartControl = chrome.usesInlineWeekStartSelector ? (
    <SegmentedControl
      className="anchor-nav-week-start-seg"
      size="sm"
      options={weekStartOptions.map((item) => ({
        value: item.mode,
        label: item.label,
      }))}
      value={weekStartMode}
      onChange={(value) => setWeekStartMode(value as WeekStartMode)}
    />
  ) : (
    <DropdownMenu
      open={weekStartPickerOpen}
      onOpenChange={setWeekStartPickerOpen}
      modal={false}
    >
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="anchor-nav-week-start-trigger"
          aria-label={`${weekStartPrefixLabel} ${activeWeekStartLabel}`}
          title={`${weekStartPrefixLabel} ${activeWeekStartLabel}`}
        >
          <span>{activeWeekStartLabel}</span>
          <VendorIcon
            name="chevronDown"
            className="anchor-nav-calendar-year-trigger-caret"
            aria-hidden
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="bottom"
        sideOffset={6}
        className="anchor-nav-week-start-menu"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        {weekStartOptions.map((item) => {
          const active = item.mode === weekStartMode;
          return (
            <Button
              key={`week-start-${item.mode}`}
              type="button"
              variant="ghost"
              size="sm"
              className={`anchor-nav-week-start-item ${active ? "active" : ""}`}
              onClick={() => {
                setWeekStartMode(item.mode);
                setWeekStartPickerOpen(false);
              }}
            >
              {item.label}
            </Button>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const selectedYearMonths = useMemo<CalendarMonthModel[]>(() => {
    const year = selectedYear ?? availableYears[0] ?? null;
    if (year === null) {
      return [];
    }
    const visibleMonths = buildVisibleMonthNumbersForYear(dayBuckets, year);
    return visibleMonths.map((month) => {
      const firstDay = new Date(Date.UTC(year, month - 1, 1));
      const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
      const weekdayOfFirst = Number.isFinite(firstDay.getTime())
        ? firstDay.getUTCDay()
        : 1;
      const leadingOffset = (weekdayOfFirst - weekStartUtcDay + 7) % 7;
      const cells: CalendarDayCell[] = [];
      for (let blankIndex = 0; blankIndex < leadingOffset; blankIndex += 1) {
        cells.push({
          key: `blank-pre-${year}-${month}-${blankIndex}`,
          dateKey: null,
          day: null,
          bucket: null,
          inMonth: false,
        });
      }
      let hasAnyData = false;
      for (let day = 1; day <= daysInMonth; day += 1) {
        const dateKey = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const bucket = dayBucketByDateKey.get(dateKey) ?? null;
        if (bucket) {
          hasAnyData = true;
        }
        cells.push({
          key: dateKey,
          dateKey,
          day,
          bucket,
          inMonth: true,
        });
      }
      const trailingCount = Math.max(0, 42 - cells.length);
      for (let blankIndex = 0; blankIndex < trailingCount; blankIndex += 1) {
        cells.push({
          key: `blank-post-${year}-${month}-${blankIndex}`,
          dateKey: null,
          day: null,
          bucket: null,
          inMonth: false,
        });
      }
      return {
        month,
        title: formatMonthShortByLanguage(year, month, language),
        cells,
        hasAnyData,
      };
    });
  }, [
    availableYears,
    dayBuckets,
    dayBucketByDateKey,
    language,
    selectedYear,
    weekStartUtcDay,
  ]);

  useEffect(() => {
    if (!selectedYearMonths.length) {
      if (selectedMonth !== null) {
        setSelectedMonth(null);
      }
      return;
    }
    const selectedDateMonth =
      selectedDateKey && toYearFromDateKey(selectedDateKey) === activeYear
        ? toMonthFromDateKey(selectedDateKey)
        : null;
    const hasSelectedDateMonth =
      selectedDateMonth !== null &&
      selectedYearMonths.some((monthModel) => monthModel.month === selectedDateMonth);
    const hasSelectedMonth =
      selectedMonth !== null &&
      selectedYearMonths.some((monthModel) => monthModel.month === selectedMonth);
    const targetMonth = hasSelectedDateMonth
      ? selectedDateMonth
      : hasSelectedMonth
        ? selectedMonth
        : selectedYearMonths[0]?.month ?? null;
    if (targetMonth !== selectedMonth) {
      setSelectedMonth(targetMonth);
    }
  }, [activeYear, selectedDateKey, selectedMonth, selectedYearMonths]);

  useEffect(() => {
    if (selectedDateKey === lastObservedSelectedDateKeyRef.current) {
      return;
    }
    const selectedDateYear = toYearFromDateKey(selectedDateKey);
    const selectedDateMonth = toMonthFromDateKey(selectedDateKey);
    if (selectedDateYear !== activeYear || selectedDateMonth === null) {
      return;
    }
    if (
      !selectedYearMonths.some(
        (monthModel) => monthModel.month === selectedDateMonth,
      )
    ) {
      return;
    }
    lastObservedSelectedDateKeyRef.current = selectedDateKey;
    setSelectedMonth((current) =>
      current === selectedDateMonth ? current : selectedDateMonth,
    );
  }, [activeYear, selectedDateKey, selectedYearMonths]);

  const selectedMonthModel = useMemo(
    () =>
      selectedYearMonths.find((monthModel) => monthModel.month === selectedMonth) ??
      selectedYearMonths[0] ??
      null,
    [selectedMonth, selectedYearMonths],
  );

  const activeMonthLabel = selectedMonthModel?.title ?? noneLabel;

  const selectedMonthDayBuckets = useMemo(() => {
    if (activeYear === null || selectedMonthModel === null) {
      return [] as DayBucket[];
    }
    return dayBuckets
      .filter(
        (bucket) =>
          toYearFromDateKey(bucket.date) === activeYear &&
          toMonthFromDateKey(bucket.date) === selectedMonthModel.month,
      )
      .sort((left, right) => left.date.localeCompare(right.date));
  }, [activeYear, dayBuckets, selectedMonthModel]);

  const intradayDayListItems = useMemo<IntradayDayListItem[]>(
    () =>
      selectedMonthDayBuckets.map((bucket) => {
        const sourceMap = calendarBarMap.size ? calendarBarMap : barMap;
        const startBar = sourceMap.get(bucket.startIndex) ?? null;
        const endBar = sourceMap.get(bucket.endIndex) ?? null;
        const startText = startBar
          ? formatTimeByLanguage(startBar.startTs || startBar.ts, language)
          : "";
        const endText = endBar
          ? formatTimeByLanguage(endBar.endTs || endBar.ts, language)
          : "";
        return {
          bucket,
          label: formatDayListDateByLanguage(bucket.date, language),
          supportText:
            startText && endText && startText !== endText
              ? `${startText} - ${endText}`
              : endText || startText,
          countText: formatMoney(bucket.count, 0),
        };
      }),
    [
      barMap,
      calendarBarMap,
      hasIntraday,
      language,
      selectedMonthDayBuckets,
    ],
  );

  const maxDayCount = useMemo(() => {
    let max = 0;
    dayBuckets.forEach((item) => {
      if (item.count > max) {
        max = item.count;
      }
    });
    return Math.max(1, max);
  }, [dayBuckets]);

  const dayTimeOptions = useMemo(() => {
    if (!selectedDayBucket) {
      return [] as Array<{
        index: number;
        label: string;
        closeText: string;
        tone: TimeTone;
      }>;
    }
    const detailBars =
      hasIntraday
        ? (overview?.bars ?? []).filter(
            (item) => toDateKey(item.ts) === selectedDayBucket.date,
          )
        : selectedDayBucket.anchorIndexes
            .map((index) => barMap.get(index) ?? null)
            .filter((item): item is AnchorOverviewBar => Boolean(item));
    return detailBars.map((bar) => {
      const index = bar.index;
      const prevBar = index > 0 ? barMap.get(index - 1) : null;
      const fallbackBase = Number.isFinite(bar?.open)
        ? Number(bar?.open)
        : Number(bar?.close);
      const reference = Number.isFinite(prevBar?.close)
        ? Number(prevBar?.close)
        : fallbackBase;
      const close = Number.isFinite(bar?.close) ? Number(bar?.close) : 0;
      const tone: TimeTone =
        close > reference ? "up" : close < reference ? "down" : "flat";
      return {
        index,
        label: formatTimeByLanguage(bar?.startTs || bar?.ts || "", language),
        closeText: formatMoney(close, 2),
        tone,
      };
    });
  }, [barMap, hasIntraday, language, overview?.bars, selectedDayBucket]);

  const effectiveAnchorBar = useMemo(() => {
    if (draftAnchorBar) {
      return draftAnchorBar;
    }
    const sourceOverview = rootOverview ?? overview;
    if (!sourceOverview) {
      return null;
    }
    const resolvedAnchor = resolveAnchorInWindow(sourceOverview);
    if (!Number.isFinite(resolvedAnchor)) {
      return null;
    }
    return (
      sourceOverview.bars[
        Math.max(0, Number(resolvedAnchor) - sourceOverview.offset)
      ] ?? null
    );
  }, [draftAnchorBar, overview, resolveAnchorInWindow, rootOverview]);

  const effectiveAnchorSourceWindow = activeWindow ?? rootOverview ?? overview;
  const effectiveAnchorIndex = effectiveAnchorBar?.index ?? null;
  const committedAnchorIndex = effectiveAnchorIndex;
  const effectiveAnchorDateKey = useMemo(
    () => (effectiveAnchorBar ? toDateKey(effectiveAnchorBar.ts) : selectedDateKey),
    [effectiveAnchorBar, selectedDateKey],
  );

  const currentWindowAnchorRatio = useMemo(() => {
    const totalBars = Math.max(
      0,
      Math.floor(
        Number(rootOverview?.trainingTotal ?? overview?.trainingTotal) || 0,
      ),
    );
    if (!effectiveAnchorBar || totalBars <= 0) {
      return 0;
    }
    const anchor = clamp(
      Math.floor(Number(effectiveAnchorBar.endTrainingIndex) || 0) + 1,
      0,
      totalBars,
    );
    return anchor / totalBars;
  }, [effectiveAnchorBar, overview?.trainingTotal, rootOverview?.trainingTotal]);

  const previewStats = useMemo(() => {
    const totalBars = Math.max(
      0,
      Math.floor(
        Number(rootOverview?.trainingTotal ?? overview?.trainingTotal) || 0,
      ),
    );
    if (!effectiveAnchorBar) {
      return {
        historyBars: 0,
        remainingBars: 0,
        totalBars,
      };
    }
    const anchor = Math.max(
      0,
      Math.floor(Number(effectiveAnchorBar.endTrainingIndex) || 0),
    );
    const historyBars = Math.min(totalBars, anchor + 1);
    const remainingBars = Math.max(0, totalBars - anchor - 1);
    return {
      historyBars,
      remainingBars,
      totalBars,
    };
  }, [effectiveAnchorBar, overview?.trainingTotal, rootOverview?.trainingTotal]);

  const progressText = ttf("appText.historyShownValue0Value1", [
    formatMoney(previewStats.historyBars, 0),
    formatMoney(previewStats.totalBars, 0),
  ]);
  const remainingText = ttf("appText.availableTrainingValue0", [
    formatMoney(previewStats.remainingBars, 0),
  ]);
  const isDrilldownWindow = Boolean(
    rootOverview && overview && rootOverview !== overview,
  );
  const isWindowTruncated = Boolean(
    !isDrilldownWindow &&
      overview &&
      overview.total > overview.bars.length,
  );
  const windowTruncatedText =
    isWindowTruncated && overview
      ? ttf("appText.windowLimitedDataShownValue0Value1FullTimeline", [
          formatMoney(overview.bars.length, 0),
          formatMoney(overview.total, 0),
        ])
      : "";

  const {
    commitAnchorTarget,
    handleApply,
    handleCancel,
    handleStatusTrackKeyDown,
    previewAnchorTarget,
    resolveNearestMapSampleIndex,
  } = useAnchorNavigatorInteractions({
    activeWindow,
    barMap,
    canInteract,
    commitMode,
    effectiveAnchorBar,
    effectiveTimeframe,
    effectiveViewMode,
    isEmbedded,
    isMapDraggingRef,
    isPanelVisible,
    isRangeOverviewTarget,
    isReplayableLeafAnchorBar,
    loadDetailWindowForBucket,
    mapBarsRef,
    mapCanvasRef,
    mapCursorHandleRef,
    mapPointerRafRef,
    onApplyAnchor,
    overview,
    pendingMapPointerTargetRef,
    requestDialogClose,
    resolveDayBucketForNavigationBar,
    resolveNearestOverviewBarByTrainingIndex,
    rootOverview,
    setDraftAnchorBar,
    setHasDraftAnchorSelection,
    setIsApplying,
    setOpen,
    setSelectedAnchorIndex,
    setSelectedDateKey,
  });

  return (
    <AnchorNavigatorControlView
      model={{
      activeMonthLabel,
      activeStatusPointerIdRef,
      activeYear,
      availableYears,
      barMap,
      calendarTabLabel,
      canInteract,
      chrome,
      commitAnchorTarget,
      commitMode,
      committedAnchorIndex,
      currentWindowAnchorRatio,
      dayBuckets,
      dayTimeOptions,
      effectiveAnchorBar,
      effectiveAnchorDateKey,
      effectiveAnchorSourceWindow,
      effectiveInstrumentId,
      effectiveTimeframe,
      effectiveViewMode,
      handleApply,
      handleCancel,
      handleStatusTrackKeyDown,
      hasDraftAnchorSelection,
      hasIntraday,
      intradayDayListItems,
      isApplying,
      isBusy,
      isDisabled,
      isEmbedded,
      isHistoryPreview,
      isLoading,
      isPanelVisible,
      isReplayableLeafAnchorBar,
      isStartPointDisplayPeriodCoarser,
      isStatusDraggingRef,
      isWindowTruncated,
      language,
      loadError,
      loadingLabel,
      mapBars,
      mapCanvasRef,
      mapCursorHandleRef,
      maxDayCount,
      monthPickerOpen,
      noneLabel,
      onPreviewStatusChange,
      open,
      overview,
      panelAlignOffset,
      previewAnchorTarget,
      previewStats,
      progressText,
      remainingText,
      requestDialogClose,
      resolveNearestMapSampleIndex,
      resolveStatusTrackAnchorByClientPoint,
      rootOverview,
      selectedAnchorIndex,
      selectedDateKey,
      selectedDayBucket,
      selectedMonthModel,
      selectedYearIndex,
      selectedYearMonths,
      setDraftAnchorBar,
      setHasDraftAnchorSelection,
      setMonthPickerOpen,
      setOpen,
      setSelectedAnchorIndex,
      setSelectedDateKey,
      setSelectedMonth,
      setSelectedYear,
      setViewMode,
      setWeekStartPickerOpen,
      setYearPickerOpen,
      statusTrackRef,
      themeMode,
      triggerAnchorText,
      triggerLabel,
      ui,
      viewMode,
      weekStartControl,
      weekStartPrefixLabel,
      weekdayLabels,
      windowTruncatedText,
      yearPickerOpen,
      }}
    />
  );
};

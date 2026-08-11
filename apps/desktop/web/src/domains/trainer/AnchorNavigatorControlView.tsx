// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, type CSSProperties } from "react";
import { Button } from "@/ui/primitives/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/ui/primitives/dropdown-menu";
import { SegmentedControl } from "@/ui/primitives/segmented-control";
import { AnchorOverviewMapGraphic, VendorIcon } from "@/assets/graphics";
import { formatMoney } from "@/ui/formatting/format";
import { tt } from "@/frontend-kernel/i18n/messageRuntime";
import { toYearFromDateKey } from "@/domains/trainer/anchorNavigatorCalendar";
import type {
  AnchorNavigatorControlViewModel,
  DayBucket,
  ViewMode,
} from "@/domains/trainer/anchorNavigatorControlTypes";
import {
  MAP_SVG_HEIGHT,
  MAP_SVG_WIDTH,
  STATUS_TREND_SVG_HEIGHT,
  clamp,
  formatDateByLanguage,
  toDateKey,
  toMonthFromDateKey,
} from "@/domains/trainer/anchorNavigatorControlModel";
import { useAnchorNavigatorViewState } from "@/domains/trainer/useAnchorNavigatorViewState";

type AnchorNavigatorControlViewProps = {
  model: AnchorNavigatorControlViewModel;
};

export const AnchorNavigatorControlView = ({
  model,
}: AnchorNavigatorControlViewProps) => {
  const {
    activeMonthLabel,
    activeYear,
    availableYears,
    barMap,
    calendarTabLabel,
    canInteract,
    chrome,
    commitAnchorTarget,
    commitMode,
    dayBuckets,
    dayTimeOptions,
    effectiveAnchorBar,
    effectiveAnchorDateKey,
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
    isDisabled,
    isEmbedded,
    isHistoryPreview,
    isLoading,
    isStartPointDisplayPeriodCoarser,
    isWindowTruncated,
    language,
    loadError,
    loadingLabel,
    mapCanvasRef,
    mapCursorHandleRef,
    maxDayCount,
    monthPickerOpen,
    noneLabel,
    open,
    overview,
    panelAlignOffset,
    previewStats,
    progressText,
    remainingText,
    requestDialogClose,
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
  } = model;

  const {
    anchorDateLabel,
    anchorStartText,
    canApply,
    canMoveToNextYear,
    canMoveToPrevYear,
    historyPercent,
    leftMaskWidthPercent,
    mapSvgShape,
    mapTooltipText,
    remainingWarning,
    statusAnchorLeftPercent,
    statusTrendShape,
  } = useAnchorNavigatorViewState(model);

  const handleSelectDayBucket = useCallback(
    (
      bucket: DayBucket | null,
      dateKey: string | null = bucket?.date ?? null,
    ) => {
      if (!bucket || !dateKey || !canInteract) {
        return;
      }
      const target = barMap.get(bucket.endIndex) ?? null;
      if (
        commitMode === "immediate" ||
        (target &&
          isStartPointDisplayPeriodCoarser(
            target.displayPeriod,
            effectiveTimeframe,
          ))
      ) {
        commitAnchorTarget(target);
        return;
      }
      setSelectedDateKey(dateKey);
      setSelectedAnchorIndex(bucket.endIndex);
      if (target) {
        setDraftAnchorBar(target);
      }
      setHasDraftAnchorSelection(true);
    },
    [barMap, canInteract, commitMode, commitAnchorTarget, effectiveTimeframe],
  );

  const handleSelectMonth = useCallback(
    (month: number) => {
      setSelectedMonth(month);
      setMonthPickerOpen(false);
      const targetMonthModel =
        selectedYearMonths.find((monthModel) => monthModel.month === month) ??
        null;
      if (!targetMonthModel) {
        return;
      }
      const selectedDateMonth = toMonthFromDateKey(selectedDateKey);
      const selectedDateYear = toYearFromDateKey(selectedDateKey);
      if (selectedDateYear === activeYear && selectedDateMonth === month) {
        return;
      }
      const firstAvailableCell =
        targetMonthModel.cells.find(
          (cell) => cell.inMonth && cell.dateKey && cell.bucket,
        ) ?? null;
      handleSelectDayBucket(
        firstAvailableCell?.bucket ?? null,
        firstAvailableCell?.dateKey ?? null,
      );
    },
    [activeYear, handleSelectDayBucket, selectedDateKey, selectedYearMonths],
  );

  const hasMultipleYearOptions = availableYears.length > 1;
  const hasMultipleMonthOptions = selectedYearMonths.length > 1;
  const activeYearLabel = activeYear !== null ? String(activeYear) : noneLabel;

  const yearPickerControl =
    chrome.usesInlineYearLabel || !hasMultipleYearOptions ? (
      <span className="anchor-nav-calendar-period-label is-year">
        {activeYearLabel}
      </span>
    ) : (
      <DropdownMenu
        open={yearPickerOpen}
        onOpenChange={setYearPickerOpen}
        modal={false}
      >
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="anchor-nav-calendar-year-trigger"
            aria-label={tt("appText.dateTime")}
          >
            <span>{activeYearLabel}</span>
            <VendorIcon
              name="chevronDown"
              className="anchor-nav-calendar-year-trigger-caret"
              aria-hidden
            />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="center"
          side="bottom"
          sideOffset={6}
          className="anchor-nav-year-picker-content"
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <div className="anchor-nav-year-picker-grid">
            {availableYears.map((year) => {
              const active = activeYear === year;
              return (
                <Button
                  key={`year-pick-${year}`}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={`anchor-nav-year-picker-item ${active ? "active" : ""}`}
                  onClick={() => {
                    setMonthPickerOpen(false);
                    setSelectedYear(year);
                    const firstDayInYear =
                      dayBuckets.find(
                        (item) => toYearFromDateKey(item.date) === year,
                      ) ?? null;
                    handleSelectDayBucket(firstDayInYear);
                    setYearPickerOpen(false);
                  }}
                >
                  {String(year)}
                </Button>
              );
            })}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    );

  const monthPickerControl = !hasMultipleMonthOptions ? (
    <span className="anchor-nav-calendar-period-label is-month">
      {activeMonthLabel}
    </span>
  ) : (
    <DropdownMenu
      open={monthPickerOpen}
      onOpenChange={setMonthPickerOpen}
      modal={false}
    >
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="anchor-nav-calendar-month-trigger"
          aria-label={activeMonthLabel}
          title={activeMonthLabel}
        >
          <span>{activeMonthLabel}</span>
          <VendorIcon
            name="chevronDown"
            className="anchor-nav-calendar-year-trigger-caret"
            aria-hidden
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="center"
        side="bottom"
        sideOffset={6}
        className="anchor-nav-month-picker-content"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <div className="anchor-nav-month-picker-list">
          {selectedYearMonths.map((monthModel) => {
            const active = selectedMonthModel?.month === monthModel.month;
            return (
              <Button
                key={`month-pick-${activeYear ?? 0}-${monthModel.month}`}
                type="button"
                variant="ghost"
                size="sm"
                className={`anchor-nav-month-picker-item ${active ? "active" : ""}`}
                onClick={() => {
                  setYearPickerOpen(false);
                  handleSelectMonth(monthModel.month);
                }}
              >
                {monthModel.title}
              </Button>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const anchorStatus = (
    <div
      className={`anchor-nav-status ${remainingWarning ? "is-warning" : ""} ${
        commitMode === "explicit" ? "" : "is-compact"
      } ${isHistoryPreview ? "is-history-preview" : ""}`}
    >
      <div className="anchor-nav-status-main">
        {!isHistoryPreview ? (
          <div className="anchor-nav-status-text">
            <span>{progressText}</span>
            <span>{remainingText}</span>
          </div>
        ) : null}
        {isEmbedded ? (
          <div className="anchor-nav-trend-row">
            <div
              className={`anchor-nav-trend-track ${
                canInteract ? "is-interactive" : ""
              }`}
              ref={statusTrackRef}
              role="slider"
              tabIndex={canInteract ? 0 : -1}
              aria-label={anchorStartText}
              aria-valuemin={0}
              aria-valuemax={Math.max(0, previewStats.totalBars - 1)}
              aria-valuenow={Math.max(
                0,
                Math.floor(Number(effectiveAnchorBar?.endTrainingIndex) || 0),
              )}
              aria-valuetext={anchorDateLabel}
              onKeyDown={handleStatusTrackKeyDown}
            >
              <AnchorOverviewMapGraphic
                className="anchor-nav-trend-svg"
                width={MAP_SVG_WIDTH}
                height={STATUS_TREND_SVG_HEIGHT}
                areaPath={statusTrendShape.areaPath}
                linePath={statusTrendShape.linePath}
                ariaLabel={ui.chartSettings}
              />
              <div
                className="anchor-nav-trend-history-mask"
                style={{ width: `${statusAnchorLeftPercent}%` }}
                aria-hidden
              />
              <div
                className="anchor-nav-trend-cursor"
                style={{ left: `${statusAnchorLeftPercent}%` }}
                aria-hidden
              />
              <div
                className="anchor-nav-trend-cursor-handle"
                style={{ left: `${statusAnchorLeftPercent}%` }}
                aria-hidden
              />
            </div>
          </div>
        ) : (
          <div
            className={`anchor-nav-progress-row ${
              isHistoryPreview ? "is-history-preview" : ""
            }`}
          >
            {!isHistoryPreview ? (
              <span
                className="anchor-nav-progress-date"
                title={anchorStartText}
              >
                {anchorDateLabel}
              </span>
            ) : null}
            <div
              className={`anchor-nav-progress-track ${
                canInteract ? "is-interactive" : ""
              }`}
              ref={statusTrackRef}
              role="slider"
              tabIndex={canInteract ? 0 : -1}
              aria-label={anchorStartText}
              aria-valuemin={0}
              aria-valuemax={Math.max(0, previewStats.totalBars - 1)}
              aria-valuenow={Math.max(
                0,
                Math.floor(Number(effectiveAnchorBar?.endTrainingIndex) || 0),
              )}
              aria-valuetext={anchorDateLabel}
              onKeyDown={handleStatusTrackKeyDown}
            >
              <span
                className="anchor-nav-progress-history"
                style={{ width: `${historyPercent}%` }}
              />
              <span
                className="anchor-nav-progress-pin"
                style={{ left: `${historyPercent}%` }}
              />
            </div>
          </div>
        )}
      </div>
      {chrome.showsApplyAction ? (
        <div className="anchor-nav-status-actions">
          {requestDialogClose ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleCancel}
              disabled={isApplying}
            >
              {tt("appText.cancel")}
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            onClick={() => void handleApply()}
            disabled={!canApply}
          >
            {requestDialogClose ? tt("appText.confirm") : tt("appText.done")}
          </Button>
        </div>
      ) : null}
    </div>
  );

  const panelContent = (
    <>
      <div
        className={`anchor-nav-head ${chrome.isEmbedded ? "is-embedded" : ""}`}
      >
        {!chrome.showsViewModeSwitch ? (
          <>
            <div className="anchor-nav-head-copy">
              <span className="anchor-nav-head-title">{ui.startPoint}</span>
              <span className="anchor-nav-head-subtitle">
                {anchorDateLabel}
              </span>
            </div>
            <div className="anchor-nav-head-actions">
              <span className="anchor-nav-week-start-prefix">
                {weekStartPrefixLabel}
              </span>
              {weekStartControl}
            </div>
          </>
        ) : (
          <>
            <div className="anchor-nav-head-left" aria-hidden />
            <SegmentedControl
              className="anchor-nav-mode-switch"
              size="sm"
              options={[
                { value: "CALENDAR", label: calendarTabLabel },
                { value: "MAP", label: tt("appText.quotesTargets") },
              ]}
              value={viewMode}
              onChange={(value) => {
                const nextMode = value as ViewMode;
                setViewMode(nextMode);
              }}
            />
          </>
        )}
      </div>
      {isWindowTruncated ? (
        <div className="anchor-nav-truncation-alert" role="note">
          <VendorIcon
            name="alertTriangle"
            className="anchor-nav-truncation-icon"
            aria-hidden
          />
          <span>{windowTruncatedText}</span>
        </div>
      ) : null}

      {isLoading ? (
        <div className="anchor-nav-loading">{loadingLabel}</div>
      ) : null}
      {!isLoading && loadError ? (
        <div className="anchor-nav-error">{loadError}</div>
      ) : null}
      {!isLoading && !loadError && (!overview || overview.total <= 0) ? (
        <div className="anchor-nav-empty">
          {tt("appText.replayMarketMoment")}
        </div>
      ) : null}

      {!isLoading && !loadError && overview && overview.total > 0 ? (
        <div className="anchor-nav-body">
          {effectiveViewMode === "CALENDAR" ? (
            <div
              className={`anchor-nav-calendar-view ${hasIntraday ? "is-intraday" : "is-daily"}`}
            >
              <div className="anchor-nav-calendar-wrap">
                <div
                  className={`anchor-nav-calendar-head ${chrome.isEmbedded ? "is-embedded" : ""}`}
                >
                  {chrome.isEmbedded ? (
                    <div
                      className="anchor-nav-calendar-head-left anchor-nav-calendar-head-left-placeholder"
                      aria-hidden
                    />
                  ) : (
                    <div className="anchor-nav-calendar-head-left">
                      <span className="anchor-nav-week-start-prefix">
                        {weekStartPrefixLabel}
                      </span>
                      {weekStartControl}
                    </div>
                  )}
                  <div className="anchor-nav-calendar-year-nav">
                    {hasMultipleYearOptions ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="anchor-nav-calendar-switch"
                        onClick={() => {
                          if (!canMoveToPrevYear) {
                            return;
                          }
                          setYearPickerOpen(false);
                          setMonthPickerOpen(false);
                          setWeekStartPickerOpen(false);
                          const nextYear =
                            availableYears[selectedYearIndex - 1] ?? null;
                          if (nextYear !== null) {
                            setSelectedYear(nextYear);
                            const firstDayInYear =
                              dayBuckets.find(
                                (item) =>
                                  toYearFromDateKey(item.date) === nextYear,
                              ) ?? null;
                            handleSelectDayBucket(firstDayInYear);
                          }
                        }}
                        disabled={!canMoveToPrevYear}
                        aria-label={tt("appText.loadMore")}
                      >
                        <VendorIcon name="chevronLeft" aria-hidden />
                      </Button>
                    ) : (
                      <span
                        className="anchor-nav-calendar-switch-spacer"
                        aria-hidden
                      />
                    )}
                    <div className="anchor-nav-calendar-year-select-wrap">
                      {isEmbedded ? (
                        <div className="anchor-nav-calendar-period-select-wrap">
                          {yearPickerControl}
                          {monthPickerControl}
                        </div>
                      ) : (
                        yearPickerControl
                      )}
                    </div>
                    {hasMultipleYearOptions ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="anchor-nav-calendar-switch"
                        onClick={() => {
                          if (!canMoveToNextYear) {
                            return;
                          }
                          setYearPickerOpen(false);
                          setMonthPickerOpen(false);
                          setWeekStartPickerOpen(false);
                          const nextYear =
                            availableYears[selectedYearIndex + 1] ?? null;
                          if (nextYear !== null) {
                            setSelectedYear(nextYear);
                            const firstDayInYear =
                              dayBuckets.find(
                                (item) =>
                                  toYearFromDateKey(item.date) === nextYear,
                              ) ?? null;
                            handleSelectDayBucket(firstDayInYear);
                          }
                        }}
                        disabled={!canMoveToNextYear}
                        aria-label={tt("appText.loadMore")}
                      >
                        <VendorIcon name="chevronRight" aria-hidden />
                      </Button>
                    ) : (
                      <span
                        className="anchor-nav-calendar-switch-spacer"
                        aria-hidden
                      />
                    )}
                  </div>
                </div>
                {isEmbedded ? (
                  hasIntraday ? (
                    <div
                      className="anchor-nav-day-list-wrap"
                      onWheelCapture={(event) => event.stopPropagation()}
                    >
                      {intradayDayListItems.length ? (
                        <div className="anchor-nav-day-list">
                          {intradayDayListItems.map((item) => {
                            const active =
                              item.bucket.date === effectiveAnchorDateKey;
                            return (
                              <Button
                                key={`day-list-${item.bucket.date}`}
                                type="button"
                                variant="ghost"
                                className={`anchor-nav-day-item ui-option-strip-item ${active ? "active is-active" : ""}`}
                                onClick={() => {
                                  handleSelectDayBucket(item.bucket);
                                }}
                              >
                                <div className="anchor-nav-day-item-copy">
                                  <span className="anchor-nav-day-item-label">
                                    {item.label}
                                  </span>
                                  <span className="anchor-nav-day-item-support">
                                    {item.supportText}
                                  </span>
                                </div>
                                <span className="anchor-nav-day-item-count">
                                  {item.countText}
                                </span>
                              </Button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="anchor-nav-day-list-empty">
                          {noneLabel}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="anchor-nav-calendar-month-panel">
                      {selectedMonthModel ? (
                        <section
                          key={`year-month-${activeYear ?? 0}-${selectedMonthModel.month}`}
                          className={`anchor-nav-year-month anchor-nav-calendar-single-month ${
                            selectedMonthModel.hasAnyData
                              ? "has-data"
                              : "no-data"
                          }`}
                        >
                          <div className="anchor-nav-year-weekdays" aria-hidden>
                            {weekdayLabels.map((label, index) => (
                              <span
                                key={`single-month-weekday-${selectedMonthModel.month}-${index}`}
                                className="anchor-nav-year-weekday"
                              >
                                {label}
                              </span>
                            ))}
                          </div>
                          <div className="anchor-nav-year-month-days">
                            {selectedMonthModel.cells.map((cell) => {
                              if (!cell.inMonth) {
                                return (
                                  <span
                                    key={cell.key}
                                    className="anchor-nav-year-day-cell blank"
                                    aria-hidden
                                  />
                                );
                              }
                              const bucket = cell.bucket;
                              const hasData = Boolean(bucket);
                              const active = Boolean(
                                cell.dateKey &&
                                cell.dateKey === effectiveAnchorDateKey,
                              );
                              const anchorStateClass = active
                                ? hasDraftAnchorSelection
                                  ? "is-draft-anchor"
                                  : "is-current-anchor"
                                : "";
                              const heat = bucket
                                ? clamp(bucket.count / maxDayCount, 0.18, 1)
                                : 0;
                              const dayLabel = cell.dateKey
                                ? formatDateByLanguage(cell.dateKey, language)
                                : "";
                              return (
                                <Button
                                  key={cell.key}
                                  type="button"
                                  variant="ghost"
                                  className={`anchor-nav-year-day-cell ${active ? "active" : ""} ${anchorStateClass} ${hasData ? "has-data" : "no-data"}`}
                                  style={
                                    {
                                      "--anchor-day-heat": `${heat}`,
                                    } as CSSProperties
                                  }
                                  disabled={!hasData}
                                  title={
                                    hasData
                                      ? `${dayLabel} (${formatMoney(bucket?.count ?? 0, 0)})`
                                      : dayLabel
                                  }
                                  onClick={() => {
                                    handleSelectDayBucket(
                                      bucket,
                                      cell.dateKey ?? null,
                                    );
                                  }}
                                >
                                  <span className="anchor-nav-year-day-text">
                                    {cell.day ?? ""}
                                  </span>
                                  {hasData ? (
                                    <span
                                      className="anchor-nav-year-day-dot"
                                      aria-hidden
                                    />
                                  ) : null}
                                </Button>
                              );
                            })}
                          </div>
                        </section>
                      ) : null}
                    </div>
                  )
                ) : (
                  <div
                    className="anchor-nav-year-grid"
                    onWheelCapture={(event) => event.stopPropagation()}
                  >
                    {selectedYearMonths.map((monthModel) => (
                      <section
                        key={`year-month-${activeYear ?? 0}-${monthModel.month}`}
                        className={`anchor-nav-year-month ${monthModel.hasAnyData ? "has-data" : "no-data"}`}
                      >
                        <div className="anchor-nav-year-month-title">
                          {monthModel.title}
                        </div>
                        <div className="anchor-nav-year-weekdays" aria-hidden>
                          {weekdayLabels.map((label, index) => (
                            <span
                              key={`year-grid-weekday-${monthModel.month}-${index}`}
                              className="anchor-nav-year-weekday"
                            >
                              {label}
                            </span>
                          ))}
                        </div>
                        <div className="anchor-nav-year-month-days">
                          {monthModel.cells.map((cell) => {
                            if (!cell.inMonth) {
                              return (
                                <span
                                  key={cell.key}
                                  className="anchor-nav-year-day-cell blank"
                                  aria-hidden
                                />
                              );
                            }
                            const bucket = cell.bucket;
                            const hasData = Boolean(bucket);
                            const active = Boolean(
                              cell.dateKey &&
                              cell.dateKey === effectiveAnchorDateKey,
                            );
                            const anchorStateClass = active
                              ? hasDraftAnchorSelection
                                ? "is-draft-anchor"
                                : "is-current-anchor"
                              : "";
                            const heat = bucket
                              ? clamp(bucket.count / maxDayCount, 0.18, 1)
                              : 0;
                            const dayLabel = cell.dateKey
                              ? formatDateByLanguage(cell.dateKey, language)
                              : "";
                            return (
                              <Button
                                key={cell.key}
                                type="button"
                                variant="ghost"
                                className={`anchor-nav-year-day-cell ${active ? "active" : ""} ${anchorStateClass} ${hasData ? "has-data" : "no-data"}`}
                                style={
                                  {
                                    "--anchor-day-heat": `${heat}`,
                                  } as CSSProperties
                                }
                                disabled={!hasData}
                                title={
                                  hasData
                                    ? `${dayLabel} (${formatMoney(bucket?.count ?? 0, 0)})`
                                    : dayLabel
                                }
                                onClick={() => {
                                  handleSelectDayBucket(
                                    bucket,
                                    cell.dateKey ?? null,
                                  );
                                }}
                              >
                                <span className="anchor-nav-year-day-text">
                                  {cell.day ?? ""}
                                </span>
                                {hasData ? (
                                  <span
                                    className="anchor-nav-year-day-dot"
                                    aria-hidden
                                  />
                                ) : null}
                              </Button>
                            );
                          })}
                        </div>
                      </section>
                    ))}
                  </div>
                )}
              </div>
              {hasIntraday ? (
                <div
                  className="anchor-nav-time-list-wrap"
                  onWheelCapture={(event) => event.stopPropagation()}
                >
                  {selectedDayBucket ? (
                    <div className="anchor-nav-time-list">
                      {dayTimeOptions.map((item) => {
                        const active = item.index === selectedAnchorIndex;
                        return (
                          <Button
                            key={`${selectedDayBucket.date}-${item.index}`}
                            type="button"
                            variant="ghost"
                            className={`anchor-nav-time-item ui-option-strip-item ${active ? "active is-active" : ""}`}
                            onClick={() => {
                              if (!canInteract) {
                                return;
                              }
                              const target = barMap.get(item.index) ?? null;
                              if (commitMode === "immediate") {
                                commitAnchorTarget(target);
                                return;
                              }
                              setSelectedAnchorIndex(item.index);
                              if (target) {
                                setDraftAnchorBar(target);
                                setSelectedDateKey(toDateKey(target.ts));
                              }
                              setHasDraftAnchorSelection(true);
                            }}
                          >
                            <span
                              className={`anchor-nav-time-tone ${item.tone}`}
                              aria-hidden
                            />
                            <span className="anchor-nav-time-label">
                              {item.label}
                            </span>
                            <span
                              className={`anchor-nav-time-close ${item.tone}`}
                            >
                              {item.closeText}
                            </span>
                          </Button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="anchor-nav-time-placeholder">
                      {noneLabel}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="anchor-nav-map-view">
              <div
                className="anchor-nav-map-canvas"
                ref={mapCanvasRef}
                data-theme-mode={themeMode}
              >
                <AnchorOverviewMapGraphic
                  className="anchor-nav-map-svg"
                  width={MAP_SVG_WIDTH}
                  height={MAP_SVG_HEIGHT}
                  areaPath={mapSvgShape.areaPath}
                  linePath={mapSvgShape.linePath}
                  ariaLabel={ui.chartSettings}
                />
                <div
                  className="anchor-nav-map-history-mask"
                  style={{ width: `${leftMaskWidthPercent}%` }}
                  aria-hidden
                />
                <div
                  className="anchor-nav-map-cursor"
                  style={{ left: `${leftMaskWidthPercent}%` }}
                  aria-hidden
                />
                <div
                  className="anchor-nav-map-cursor-handle"
                  ref={mapCursorHandleRef}
                  style={{ left: `${leftMaskWidthPercent}%` }}
                  aria-hidden
                />
                <div
                  className="anchor-nav-map-tooltip"
                  style={{ left: `${leftMaskWidthPercent}%` }}
                  aria-hidden
                >
                  {mapTooltipText}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {anchorStatus}
    </>
  );

  const historyPreviewContent = (
    <>
      {!overview && isLoading ? (
        <div className="anchor-nav-loading">{loadingLabel}</div>
      ) : null}
      {!overview && !isLoading && loadError ? (
        <div className="anchor-nav-error">{loadError}</div>
      ) : null}
      {!isLoading && !loadError && (!overview || overview.total <= 0) ? (
        <div className="anchor-nav-empty">
          {tt("appText.replayMarketMoment")}
        </div>
      ) : null}
      {overview && overview.total > 0 ? anchorStatus : null}
    </>
  );

  if (!chrome.showsDropdownTrigger) {
    return (
      <div className="anchor-nav-panel anchor-nav-panel-embedded">
        {isHistoryPreview ? historyPreviewContent : panelContent}
      </div>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="toolbar-control anchor-nav-trigger"
          disabled={isDisabled || !effectiveInstrumentId}
          aria-label={triggerLabel}
          title={triggerLabel}
        >
          <VendorIcon
            name="flag"
            className="anchor-nav-trigger-flag"
            aria-hidden
          />
          <span className="anchor-nav-trigger-date">{triggerAnchorText}</span>
          <VendorIcon
            name="chevronDown"
            className="anchor-nav-trigger-caret"
            aria-hidden
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        alignOffset={panelAlignOffset}
        side="bottom"
        sideOffset={8}
        className="anchor-nav-panel anchor-nav-panel-dropdown"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        {panelContent}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

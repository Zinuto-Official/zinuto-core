// SPDX-License-Identifier: GPL-3.0-only

"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/ui/primitives/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/ui/primitives/dropdown-menu";
import { uiFieldShellVariants } from "@/ui/primitives/ui-system";
import { VendorIcon } from "@/assets/graphics/AppIcons";
import { cn } from "@/ui/cn";

type DatePickerProps = {
  value?: string;
  onChange?: (value: string) => void;
  min?: string;
  max?: string;
  placeholder?: string;
  allowManualInput?: boolean;
  className?: string;
  disabled?: boolean;
  density?: "compact" | "default" | "large";
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  locale?: string;
};

const DATE_INPUT_RE = /^\d{4}-\d{2}-\d{2}$/;

const pad2 = (value: number): string => String(value).padStart(2, "0");

const toDateKey = (date: Date): string =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

const parseDateInput = (value: string | undefined): Date | null => {
  const raw = String(value || "").trim();
  if (!DATE_INPUT_RE.test(raw)) {
    return null;
  }
  const [year, month, day] = raw.split("-").map((token) => Number(token));
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day)
  ) {
    return null;
  }
  const next = new Date(year, month - 1, day);
  if (
    next.getFullYear() !== year ||
    next.getMonth() !== month - 1 ||
    next.getDate() !== day
  ) {
    return null;
  }
  return next;
};

const startOfMonth = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), 1);

const addMonths = (date: Date, diff: number): Date =>
  new Date(date.getFullYear(), date.getMonth() + diff, 1);

const weekdayLabels = (locale: string): string[] => {
  const formatter = new Intl.DateTimeFormat(locale, { weekday: "short" });
  const sunday = new Date(2024, 0, 7);
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(
      sunday.getFullYear(),
      sunday.getMonth(),
      sunday.getDate() + index,
    );
    return formatter.format(day);
  });
};

const monthLabel = (date: Date, locale: string): string =>
  new Intl.DateTimeFormat(locale, { year: "numeric", month: "long" }).format(
    date,
  );

const buildMonthGrid = (month: Date): Date[] => {
  const monthStart = startOfMonth(month);
  const startDay = monthStart.getDay();
  const firstCell = new Date(
    monthStart.getFullYear(),
    monthStart.getMonth(),
    monthStart.getDate() - startDay,
  );
  return Array.from(
    { length: 42 },
    (_, index) =>
      new Date(
        firstCell.getFullYear(),
        firstCell.getMonth(),
        firstCell.getDate() + index,
      ),
  );
};

export const DatePicker = ({
  value,
  onChange,
  min,
  max,
  placeholder,
  allowManualInput = false,
  className,
  disabled,
  density = "default",
  locale = "en-US",
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: DatePickerProps) => {
  const selectedDate = useMemo(() => parseDateInput(value), [value]);
  const minDateKey = useMemo(() => {
    const date = parseDateInput(min);
    return date ? toDateKey(date) : "";
  }, [min]);
  const maxDateKey = useMemo(() => {
    const date = parseDateInput(max);
    return date ? toDateKey(date) : "";
  }, [max]);
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState<Date>(() =>
    startOfMonth(selectedDate ?? new Date()),
  );
  const [todayKey, setTodayKey] = useState(() => toDateKey(new Date()));
  useEffect(() => {
    const now = new Date();
    const nextMidnightAt = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
      0,
      0,
      0,
      0,
    );
    const timer = window.setTimeout(() => {
      setTodayKey(toDateKey(new Date()));
    }, nextMidnightAt.getTime() - now.getTime() + 1000);
    return () => window.clearTimeout(timer);
  }, [todayKey]);
  const selectedKey = selectedDate ? toDateKey(selectedDate) : "";
  const resolvedPlaceholder = placeholder ?? (allowManualInput ? "YYYY-MM-DD" : "--");

  useEffect(() => {
    if (!open) {
      setViewMonth(startOfMonth(selectedDate ?? new Date()));
    }
  }, [open, selectedDate]);

  const weekLabels = useMemo(() => weekdayLabels(locale), [locale]);
  const monthCells = useMemo(() => buildMonthGrid(viewMonth), [viewMonth]);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      {allowManualInput ? (
        <div
          data-slot="date-picker"
          data-density={density}
          data-disabled={disabled ? "true" : undefined}
          aria-invalid={ariaInvalid || undefined}
          className={cn(
            density === "large" ? "text-r3" : "text-r2",
            className,
          )}
        >
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="inline"
              size="icon-xs"
              disabled={disabled}
              aria-label={ariaLabel}
              data-date-picker-calendar-trigger="true"
            >
              <VendorIcon name="calendar" className="size-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <input
            type="text"
            data-slot="date-picker-input"
            value={value ?? ""}
            onChange={(event) => onChange?.(event.currentTarget.value)}
            readOnly={!onChange}
            disabled={disabled}
            maxLength={10}
            pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}"
            placeholder={resolvedPlaceholder}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-label={ariaLabel}
            aria-invalid={ariaInvalid || undefined}
            aria-describedby={ariaDescribedBy}
            className="h-full min-w-0 flex-1 bg-transparent p-0 text-inherit outline-none placeholder:text-[color:var(--text-disabled)]"
          />
        </div>
      ) : (
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="field"
            className={cn(
              uiFieldShellVariants({ density }),
              "justify-between",
              className,
            )}
            disabled={disabled}
            aria-label={ariaLabel}
            aria-invalid={ariaInvalid || undefined}
            aria-describedby={ariaDescribedBy}
          >
            <span className="inline-flex min-w-0 flex-1 items-center gap-2 truncate text-left">
              <VendorIcon
                name="calendar"
                className="size-4 text-muted-foreground"
                aria-hidden
              />
              <span
                className={cn(
                  "truncate",
                  selectedDate ? "" : "text-muted-foreground",
                )}
              >
                {selectedDate ? selectedKey : resolvedPlaceholder}
              </span>
            </span>
          </Button>
        </DropdownMenuTrigger>
      )}
      <DropdownMenuContent
        className="date-picker-popover z-[1310] min-w-[280px] p-2"
        align="start"
        side="bottom"
        sideOffset={6}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <div className="date-picker-calendar grid gap-2">
          <div className="date-picker-calendar-header flex items-center justify-between gap-2">
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              className="date-picker-calendar-nav shrink-0"
              onClick={() => setViewMonth((current) => addMonths(current, -1))}
            >
              <VendorIcon name="chevronLeft" className="size-4" />
            </Button>
            <strong
              className="date-picker-calendar-month flex-1 text-center text-r3 font-semibold text-text-primary"
              data-i18n-slot="datePickerMonth"
              data-i18n-critical="true"
            >
              {monthLabel(viewMonth, locale)}
            </strong>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              className="date-picker-calendar-nav shrink-0"
              onClick={() => setViewMonth((current) => addMonths(current, 1))}
            >
              <VendorIcon name="chevronRight" className="size-4" />
            </Button>
          </div>
          <div className="date-picker-calendar-grid grid grid-cols-7 gap-1">
            {weekLabels.map((label) => (
              <span
                key={`date-picker-week-${label}`}
                className="date-picker-calendar-weekday flex h-7 items-center justify-center text-r1 font-semibold text-muted-foreground"
              >
                {label}
              </span>
            ))}
            {monthCells.map((cellDate) => {
              const cellKey = toDateKey(cellDate);
              const isOutside = cellDate.getMonth() !== viewMonth.getMonth();
              const isSelected = selectedKey === cellKey;
              const isToday = todayKey === cellKey;
              const isOutOfRange =
                (minDateKey !== "" && cellKey < minDateKey) ||
                (maxDateKey !== "" && cellKey > maxDateKey);
              return (
                <Button
                  key={`date-picker-cell-${cellKey}`}
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  className={cn(
                    "date-picker-calendar-day h-[var(--ui-size-control-compact)] w-[var(--ui-size-control-compact)] rounded-[var(--ui-radius-control)] p-0 text-r2 font-medium",
                    isOutside ? "text-muted-foreground/55" : "",
                    isOutOfRange ? "text-muted-foreground/35" : "",
                    !isOutside && !isSelected ? "text-text-primary" : "",
                    isSelected
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "hover:bg-muted",
                    isToday && !isSelected ? "ring-1 ring-border" : "",
                  )}
                  disabled={isOutOfRange}
                  onClick={() => {
                    const next = selectedKey === cellKey ? "" : cellKey;
                    onChange?.(next);
                    setOpen(false);
                  }}
                >
                  {cellDate.getDate()}
                </Button>
              );
            })}
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

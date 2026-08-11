// SPDX-License-Identifier: GPL-3.0-only

import { useMemo, type CSSProperties, type ReactNode } from "react";
import { Button } from "@/ui/primitives/button";
import { useActiveSelectionRect } from "@/ui/useActiveSelectionRect";
import { cn } from "@/ui/cn";

type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
};

type SegmentedControlProps<T extends string> = {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  activeIndicator?: ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg";
  gridTemplateColumns?: CSSProperties["gridTemplateColumns"];
  selectionStyle?: "outline" | "pill" | "underline";
};

const sizeClassMap = {
  sm: "sm",
  md: "default",
  lg: "lg",
} as const;

export const shouldHandleSegmentedControlChange = <T extends string>(
  optionValue: T,
  currentValue: T,
  disabled = false,
): boolean => !disabled && optionValue !== currentValue;

export const SegmentedControl = <T extends string>({
  options,
  value,
  onChange,
  activeIndicator,
  className,
  size = "md",
  gridTemplateColumns,
  selectionStyle = "outline",
}: SegmentedControlProps<T>) => {
  const { activeRect, registerItem, setContainerNode } =
    useActiveSelectionRect<T>({
      activeValue: value,
    });
  const indicatorStyle = useMemo(() => {
    if (!activeRect) {
      return undefined;
    }
    if (selectionStyle === "underline") {
      const indicatorWidth = Math.max(activeRect.width - 24, 18);
      return {
        "--segmented-control-indicator-height": "2px",
        "--segmented-control-indicator-width": `${indicatorWidth}px`,
        "--segmented-control-indicator-x": `${activeRect.x + (activeRect.width - indicatorWidth) / 2}px`,
        "--segmented-control-indicator-y": `${activeRect.y + activeRect.height - 2}px`,
      } as CSSProperties;
    }
    return {
      "--segmented-control-indicator-height": `${activeRect.height}px`,
      "--segmented-control-indicator-width": `${activeRect.width}px`,
      "--segmented-control-indicator-x": `${activeRect.x}px`,
      "--segmented-control-indicator-y": `${activeRect.y}px`,
    } as CSSProperties;
  }, [activeRect, selectionStyle]);

  return (
    <div
      ref={setContainerNode}
      data-motion-ready={activeRect ? "true" : undefined}
      data-selection-style={selectionStyle}
      data-size={size}
      data-slot="segmented-control"
      className={cn(
        "segmented-control inline-grid w-full items-stretch gap-1 rounded-control border border-[color:var(--ui-segment-track-border)] bg-[color:var(--ui-segment-track-bg)] p-1",
        className,
      )}
      style={{
        gridTemplateColumns:
          gridTemplateColumns ??
          "repeat(auto-fit, minmax(min(100%, 10.5rem), 1fr))",
      }}
    >
      <span
        className="segmented-control-selection-indicator"
        style={indicatorStyle}
        aria-hidden="true"
      />
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Button
            key={option.value}
            ref={registerItem(option.value)}
            data-slot="segmented-option"
            data-active={active ? "true" : "false"}
            type="button"
            disabled={option.disabled}
            aria-disabled={option.disabled ? true : undefined}
            title={option.label}
            onClick={() => {
              if (
                !shouldHandleSegmentedControlChange(
                  option.value,
                  value,
                  option.disabled,
                )
              ) {
                return;
              }
              onChange(option.value);
            }}
            variant="inline"
            size={sizeClassMap[size]}
            className={cn(
              "segmented-option inline-flex min-h-10 h-auto items-center justify-center gap-1.5 rounded-[calc(var(--ui-control-radius)-1px)] px-3 py-2 text-center font-medium transition-[background-color,color,border-color,box-shadow]",
              active && "is-active",
              active
                ? cn(
                    "border text-[color:var(--text-strong)]",
                    selectionStyle === "pill"
                      ? "border-[color:var(--ui-surface-border-strong)] bg-[color:var(--ui-segment-active-bg)]"
                      : "border-[color:var(--ui-segment-outline-active-border)] bg-transparent",
                  )
                : "border border-transparent text-[color:var(--text-subtle)] hover:bg-[color:var(--ui-segment-hover-bg)] hover:text-[color:var(--text)]",
              option.disabled &&
                "is-disabled cursor-not-allowed text-[color:var(--ui-action-disabled-text)] opacity-100",
            )}
          >
            {active && activeIndicator ? (
              <span
                className="segmented-option-active-indicator"
                aria-hidden="true"
              >
                {activeIndicator}
              </span>
            ) : null}
            {option.icon ? (
              <span className="segmented-option-icon" aria-hidden="true">
                {option.icon}
              </span>
            ) : null}
            <span
              data-i18n-slot="segmentedLabel"
              data-i18n-critical="true"
              className="block min-w-0 flex-1 whitespace-normal break-words leading-tight [overflow-wrap:anywhere]"
            >
              {option.label}
            </span>
          </Button>
        );
      })}
    </div>
  );
};

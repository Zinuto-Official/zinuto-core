// SPDX-License-Identifier: GPL-3.0-only

import { useMemo, type CSSProperties, type ReactNode } from "react";
import { Button } from "@/ui/primitives/button";
import { useActiveSelectionRect } from "@/ui/useActiveSelectionRect";
import { cn } from "@/ui/cn";

type PlainTabBarItem<T extends string> = {
  key: T;
  label: ReactNode;
  desc?: ReactNode;
  disabled?: boolean;
  className?: string;
  dataAttributes?: Record<`data-${string}`, string | undefined>;
};

type PlainTabBarProps<T extends string> = {
  value: T;
  items: readonly PlainTabBarItem<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  orientation?: "horizontal" | "vertical";
  className?: string;
  itemClassName?: string;
};

export const shouldHandlePlainTabBarChange = <T extends string>(
  itemKey: T,
  currentValue: T,
  disabled = false,
): boolean => !disabled && itemKey !== currentValue;

export const PlainTabBar = <T extends string>({
  value,
  items,
  onChange,
  ariaLabel,
  orientation = "horizontal",
  className,
  itemClassName,
}: PlainTabBarProps<T>) => {
  const { activeRect, registerItem, setContainerNode } =
    useActiveSelectionRect<T>({
      activeValue: value,
    });
  const indicatorStyle = useMemo(() => {
    if (!activeRect) {
      return undefined;
    }
    if (orientation === "vertical") {
      const indicatorHeight = Math.max(activeRect.height - 20, 18);
      return {
        "--plain-tab-bar-indicator-height": `${indicatorHeight}px`,
        "--plain-tab-bar-indicator-width": "3px",
        "--plain-tab-bar-indicator-x": `${activeRect.x}px`,
        "--plain-tab-bar-indicator-y": `${activeRect.y + (activeRect.height - indicatorHeight) / 2}px`,
      } as CSSProperties;
    }
    const indicatorWidth = Math.max(activeRect.width - 16, 18);
    return {
      "--plain-tab-bar-indicator-height": "2px",
      "--plain-tab-bar-indicator-width": `${indicatorWidth}px`,
      "--plain-tab-bar-indicator-x": `${activeRect.x + (activeRect.width - indicatorWidth) / 2}px`,
      "--plain-tab-bar-indicator-y": `${activeRect.y + activeRect.height - 2}px`,
    } as CSSProperties;
  }, [activeRect, orientation]);

  return (
    <div
      ref={setContainerNode}
      className={cn("plain-tab-bar", className)}
      data-motion-ready={activeRect ? "true" : undefined}
      data-orientation={orientation}
      role="tablist"
      aria-label={ariaLabel}
    >
      <span
        className="plain-tab-bar-selection-indicator"
        style={indicatorStyle}
        aria-hidden="true"
      />
      {items.map((item) => {
        const isActive = item.key === value;
        return (
          <Button
            key={item.key}
            ref={registerItem(item.key)}
            type="button"
            variant="inline"
            role="tab"
            aria-selected={isActive}
            aria-disabled={item.disabled ? "true" : undefined}
            data-active={isActive ? "true" : undefined}
            {...item.dataAttributes}
            disabled={item.disabled}
            className={cn(
              "plain-tab-bar-item",
              orientation === "vertical" &&
                "h-auto min-h-0 items-start whitespace-normal",
              isActive && "is-active",
              item.className,
              itemClassName,
            )}
            onClick={() => {
              if (
                !shouldHandlePlainTabBarChange(item.key, value, item.disabled)
              ) {
                return;
              }
              onChange(item.key);
            }}
          >
            <span className="plain-tab-bar-item-copy">
              <span
                className="plain-tab-bar-item-label"
                data-i18n-slot="tabLabel"
                data-i18n-critical="true"
              >
                {item.label}
              </span>
              {item.desc ? (
                <span
                  className="plain-tab-bar-item-desc"
                  data-i18n-slot="tabDesc"
                  data-i18n-critical="true"
                >
                  {item.desc}
                </span>
              ) : null}
            </span>
          </Button>
        );
      })}
    </div>
  );
};

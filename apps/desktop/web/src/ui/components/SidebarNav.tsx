// SPDX-License-Identifier: GPL-3.0-only

import { Button } from "@/ui/primitives/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/ui/primitives/tooltip";
import { AppIcon } from "@/assets/graphics/AppIcons";
import { useActiveSelectionRect } from "@/ui/useActiveSelectionRect";
import type { SidebarNavGroup } from "@/ui/components/sidebarNavTypes";
import { cn } from "@/ui/cn";
import { useMemo, type CSSProperties, type ReactNode } from "react";

type SidebarNavProps = {
  brandName: string;
  brandLogo: string;
  brandLogoAlt: string;
  groups: SidebarNavGroup[];
  brandNode?: ReactNode;
  className?: string;
};

export const SidebarNav = ({
  brandName,
  brandLogo,
  brandLogoAlt,
  groups,
  brandNode,
  className,
}: SidebarNavProps) => {
  const activeItemKey = useMemo(
    () =>
      groups
        .flatMap((group) => group.items)
        .find((item) => item.active)?.key ?? null,
    [groups],
  );
  const activeGroupKey = useMemo(
    () => groups.find((group) => group.items.some((item) => item.active))?.key,
    [groups],
  );
  const { activeRect, registerItem, setContainerNode } =
    useActiveSelectionRect<string>({
      activeValue: activeItemKey,
    });
  const indicatorStyle = useMemo(() => {
    if (!activeRect) {
      return undefined;
    }
    return {
      "--sidebar-nav-indicator-height": `${Math.max(activeRect.height - 20, 18)}px`,
      "--sidebar-nav-indicator-width": "3px",
      "--sidebar-nav-indicator-x": `${activeRect.x + 1}px`,
      "--sidebar-nav-indicator-y": `${activeRect.y + (activeRect.height - Math.max(activeRect.height - 20, 18)) / 2}px`,
    } as CSSProperties;
  }, [activeRect]);

  return (
    <aside
      className={cn(
        "left-rail sidebar-nav flex h-full min-w-0 flex-col",
        className,
      )}
    >
      <div className="sidebar-content-offset flex min-h-0 flex-1 flex-col gap-0">
        <div className="sidebar-brand">
          {brandNode ? (
            <div className="sidebar-brand-main sidebar-brand-main-interactive">
              {brandNode}
            </div>
          ) : (
            <div className="sidebar-brand-main">
              <div className="sidebar-brand-mark">
                <img
                  className="sidebar-brand-logo"
                  src={brandLogo}
                  alt={brandLogoAlt}
                  title={brandName}
                  draggable={false}
                />
                <span className="sidebar-brand-mark-glow" aria-hidden="true" />
              </div>
              <div className="sidebar-brand-copy">
                <span className="sidebar-brand-name" title={brandName}>
                  {brandName}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="sidebar-groups">
          <div
            ref={setContainerNode}
            className="sidebar-groups-content sidebar-nav-motion-track"
            data-active-group={activeGroupKey}
            data-motion-ready={activeRect ? "true" : undefined}
          >
            <span
              className="sidebar-nav-selection-indicator"
              style={indicatorStyle}
              aria-hidden="true"
            />
            {groups.map((group) => (
              <section
                key={group.key}
                className={cn("sidebar-group", `sidebar-group-${group.key}`)}
              >
                <div className="sidebar-group-items">
                  {group.items.map((item) => {
                    const supplementalLabel = item.noticeLabel ?? "";
                    const itemLabel = supplementalLabel
                      ? `${item.label} - ${supplementalLabel}`
                      : item.label;
                    const rightSlot = item.rightSlot;
                    return (
                      <Tooltip key={item.key} delay={0}>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={itemLabel}
                            onClick={item.onClick}
                            onFocus={item.onFocus}
                            onPointerDown={item.onPointerDown}
                            onPointerEnter={item.onPointerEnter}
                            ref={registerItem(item.key)}
                            data-active={item.active ? "true" : undefined}
                            data-nav-item-key={item.key}
                            className={cn(
                              "sidebar-nav-item group flex w-full items-center justify-between text-left transition-colors",
                              rightSlot ? "has-side-action" : "",
                              item.noticeTone ? "has-notice" : "",
                              item.active ? "active" : "",
                            )}
                          >
                            <span className="sidebar-nav-item-main">
                              <span className="sidebar-nav-item-icon-wrap">
                                <AppIcon
                                  name={item.icon}
                                  className="sidebar-nav-item-icon"
                                />
                              </span>
                              <span
                                className="sidebar-nav-item-label"
                                data-i18n-slot="navLabel"
                                data-i18n-critical="true"
                              >
                                <span>{item.label}</span>
                              </span>
                            </span>
                            {item.noticeTone ? (
                              <span
                                className="sidebar-nav-item-notice-dot"
                                data-notice-tone={item.noticeTone}
                                aria-hidden="true"
                              />
                            ) : null}
                            {rightSlot ? (
                              <span className="sidebar-nav-item-right">
                                {rightSlot}
                              </span>
                            ) : null}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent
                          side="right"
                          sideOffset={8}
                          className="quick-hover-tooltip-content"
                          showArrow={false}
                        >
                          <span data-i18n-slot="navTooltip">
                            {itemLabel}
                          </span>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
};

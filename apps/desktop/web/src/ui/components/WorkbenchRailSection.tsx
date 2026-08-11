// SPDX-License-Identifier: GPL-3.0-only

import type { ElementType, ReactNode } from "react";

import { cn } from "@/ui/cn";

type WorkbenchRailSectionProps = {
  as?: ElementType;
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
  footerClassName?: string;
  titleClassName?: string;
  descriptionClassName?: string;
  surface?: "card" | "flush";
};

export const WorkbenchRailSection = ({
  as: Component = "section",
  title,
  description,
  actions,
  footer,
  children,
  className,
  headerClassName,
  contentClassName,
  footerClassName,
  titleClassName,
  descriptionClassName,
  surface = "card",
}: WorkbenchRailSectionProps) => {
  const hasHeader = title || description || actions;

  return (
    <Component
      data-surface={surface}
      className={cn(
        "workbench-rail-section min-w-0",
        surface === "card"
          ? "rounded-[var(--ui-radius-surface)] border border-[color:var(--ui-surface-border-soft)] bg-[color:var(--ui-surface-bg)] px-3 py-3"
          : "rounded-none border-0 bg-transparent px-0 py-0",
        className,
      )}
    >
      {hasHeader ? (
        <div
          className={cn(
            "workbench-rail-section-header flex min-w-0 items-start justify-between gap-3",
            headerClassName,
          )}
        >
          <div className="min-w-0 flex-1">
            {title ? (
              <div
                className={cn(
                  "workbench-rail-section-title text-r3 font-semibold text-[color:var(--text-strong)]",
                  titleClassName,
                )}
              >
                {title}
              </div>
            ) : null}
            {description ? (
              <div
                className={cn(
                  "workbench-rail-section-description mt-1 text-r1 text-[color:var(--text-subtle)]",
                  descriptionClassName,
                )}
              >
                {description}
              </div>
            ) : null}
          </div>
          {actions ? (
            <div className="workbench-rail-section-actions flex shrink-0 items-center gap-2">
              {actions}
            </div>
          ) : null}
        </div>
      ) : null}
      <div
        className={cn(
          "workbench-rail-section-content min-w-0",
          hasHeader ? "mt-3" : "",
          contentClassName,
        )}
      >
        {children}
      </div>
      {footer ? (
        <div
          className={cn(
            "workbench-rail-section-footer mt-3 min-w-0",
            footerClassName,
          )}
        >
          {footer}
        </div>
      ) : null}
    </Component>
  );
};

// SPDX-License-Identifier: GPL-3.0-only

import type { ReactNode } from "react";
import { cn } from "@/ui/cn";
import { StandardSheetFrame } from "@/ui/components";

export type TradingSettingsSheetSection = {
  id: string;
  label: string;
  content: ReactNode;
  className?: string;
};

type TradingSettingsSheetLayoutProps = {
  title: ReactNode;
  description?: ReactNode;
  sidebar?: ReactNode;
  footerActions?: ReactNode;
  sections: TradingSettingsSheetSection[];
  className?: string;
  bodyClassName?: string;
  headerClassName?: string;
  footerClassName?: string;
  sidebarClassName?: string;
  sectionsClassName?: string;
};

export const TradingSettingsSheetLayout = ({
  title,
  description,
  sidebar,
  footerActions,
  sections,
  className,
  bodyClassName,
  headerClassName,
  footerClassName,
  sidebarClassName,
  sectionsClassName,
}: TradingSettingsSheetLayoutProps) => (
  <StandardSheetFrame
    className={className}
    headerClassName={headerClassName}
    bodyClassName={cn("trading-settings-sheet-layout-body", bodyClassName)}
    footerClassName={footerClassName}
    title={title}
    description={description}
    actions={footerActions}
  >
    <div className="trading-settings-sheet-layout">
      {sidebar ? (
        <aside
          className={cn("trading-settings-sheet-sidebar", sidebarClassName)}
        >
          {sidebar}
        </aside>
      ) : null}

      <div
        className={cn(
          "trading-settings-sheet-sections",
          sectionsClassName,
        )}
      >
        {sections.map((section) => (
          <section
            key={section.id}
            data-section-id={section.id}
            className={cn(
              "trading-settings-sheet-content-section",
              section.className,
            )}
          >
            {section.content}
          </section>
        ))}
      </div>
    </div>
  </StandardSheetFrame>
);

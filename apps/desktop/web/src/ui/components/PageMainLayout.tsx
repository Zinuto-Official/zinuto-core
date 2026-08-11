// SPDX-License-Identifier: GPL-3.0-only

import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/ui/cn";
import { SubtleDivider } from "@/ui/components/SubtleDivider";

type PageMainLayoutProps = ComponentPropsWithoutRef<"div"> & {
  children: ReactNode;
  sidebar?: ReactNode;
  sidebarPosition?: "start" | "end";
  mainClassName?: string;
  sidebarClassName?: string;
  divider?: "subtle";
};

export const PageMainLayout = ({
  children,
  sidebar,
  sidebarPosition = "end",
  className,
  mainClassName,
  sidebarClassName,
  divider,
  ...props
}: PageMainLayoutProps) => (
  <div
    data-page-slot="page-main"
    data-sidebar-position={sidebarPosition}
    className={cn(
      "page-main-layout",
      sidebar && "has-sidebar",
      sidebar && divider && "has-divider",
      className,
    )}
    {...props}
  >
    {sidebar && sidebarPosition === "start" ? (
      <aside
        data-page-slot="page-sidebar"
        className={cn("page-main-layout-sidebar", sidebarClassName)}
      >
        {sidebar}
      </aside>
    ) : null}
    {sidebar && sidebarPosition === "start" && divider === "subtle" ? (
      <SubtleDivider
        orientation="vertical"
        className="page-main-layout-divider"
      />
    ) : null}
    <div className={cn("page-main-layout-main", mainClassName)}>{children}</div>
    {sidebar && sidebarPosition === "end" ? (
      <>
        {divider === "subtle" ? (
          <SubtleDivider
            orientation="vertical"
            className="page-main-layout-divider"
          />
        ) : null}
        <aside
          data-page-slot="page-sidebar"
          className={cn("page-main-layout-sidebar", sidebarClassName)}
        >
          {sidebar}
        </aside>
      </>
    ) : null}
  </div>
);

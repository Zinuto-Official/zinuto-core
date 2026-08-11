// SPDX-License-Identifier: GPL-3.0-only

import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { PageMainLayout } from "@/ui/components/PageMainLayout";

type PageSidebarLayoutProps = Omit<
  ComponentPropsWithoutRef<typeof PageMainLayout>,
  "children" | "sidebar" | "content"
> & {
  sidebar: ReactNode;
  content: ReactNode;
};

export const PageSidebarLayout = ({
  sidebar,
  content,
  sidebarPosition = "start",
  ...props
}: PageSidebarLayoutProps) => (
  <PageMainLayout
    sidebar={sidebar}
    sidebarPosition={sidebarPosition}
    {...props}
  >
    {content}
  </PageMainLayout>
);

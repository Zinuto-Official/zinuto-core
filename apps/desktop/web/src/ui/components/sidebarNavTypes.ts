// SPDX-License-Identifier: GPL-3.0-only

import type { ReactNode } from "react";
import type { AppIconName } from "@/assets/graphics";

export type SidebarNavItem = {
  key: string;
  label: string;
  icon: AppIconName;
  active?: boolean;
  noticeTone?: "NOTICE" | "MAINTENANCE" | "OUTAGE";
  noticeLabel?: string;
  onClick: () => void;
  onFocus?: () => void;
  onPointerEnter?: () => void;
  onPointerDown?: () => void;
  rightSlot?: ReactNode;
};

export type SidebarNavGroup = {
  key: string;
  label: string;
  items: SidebarNavItem[];
};

// SPDX-License-Identifier: GPL-3.0-only

import { SegmentedControl } from "@/ui/primitives/segmented-control";
import { AppIcon } from "@/assets/graphics";
import { commitThemeChangeWithTransition } from "@/ui/theme/themeTransition";
import type { ThemeMode } from "@/ui/theme/themeTokens";
import type { CSSProperties } from "react";

type ThemeToggleProps = {
  value: ThemeMode;
  onChange: (mode: ThemeMode) => void;
  labels: {
    light: string;
    dark: string;
    system: string;
  };
  className?: string;
  gridTemplateColumns?: CSSProperties["gridTemplateColumns"];
};

export const ThemeToggle = ({
  value,
  onChange,
  labels,
  className,
  gridTemplateColumns,
}: ThemeToggleProps) => {
  const handleThemeChange = (nextMode: ThemeMode) => {
    commitThemeChangeWithTransition(() => onChange(nextMode));
  };

  return (
    <SegmentedControl
      className={className}
      value={value}
      onChange={handleThemeChange}
      gridTemplateColumns={gridTemplateColumns}
      activeIndicator={<AppIcon name="actionCheck" className="size-3" />}
      options={[
        { value: "light", label: labels.light },
        { value: "dark", label: labels.dark },
        { value: "system", label: labels.system },
      ]}
    />
  );
};

// SPDX-License-Identifier: GPL-3.0-only

import { useMemo } from "react";
import type { ApiSystemStorageUsage } from "@/api";
import { tt } from "@/frontend-kernel/i18n/messageRuntime";

type ThemeMode = "light" | "dark" | "system";
type FontSizePreset = "SMALL" | "STANDARD" | "LARGE";
type UiLanguage = "en" | "zh-CN" | "ja" | "ko" | "es";

type UseSystemSettingsWorkspaceViewModelArgs = {
  language: UiLanguage;
  ui: {
    followSystem: string;
    darkMode: string;
    lightMode: string;
  };
  themeMode: ThemeMode;
  systemThemeMode: Exclude<ThemeMode, "system">;
  fontSizePreset: FontSizePreset;
  languageOptions: Array<{ key: UiLanguage; label: string }>;
  fontSizePresetOptions: Array<{ key: FontSizePreset; label: string }>;
  systemStorageUsage: ApiSystemStorageUsage | null;
  formatStorageBytes: (value: number) => string;
};

export const useSystemSettingsWorkspaceViewModel = ({
  language,
  ui,
  themeMode,
  systemThemeMode,
  fontSizePreset,
  languageOptions,
  fontSizePresetOptions,
  systemStorageUsage,
  formatStorageBytes,
}: UseSystemSettingsWorkspaceViewModelArgs) => {
  const activeLanguageLabel = useMemo(
    () =>
      languageOptions.find((item) => item.key === language)?.label ??
      languageOptions[0]?.label ??
      "",
    [language, languageOptions],
  );

  const effectiveThemeMode =
    themeMode === "system" ? systemThemeMode : themeMode;
  const activeThemeLabel =
    themeMode === "system"
      ? `${ui.followSystem} (${effectiveThemeMode === "dark" ? ui.darkMode : ui.lightMode})`
      : themeMode === "dark"
        ? ui.darkMode
        : ui.lightMode;

  const activeFontSizeLabel = useMemo(
    () =>
      fontSizePresetOptions.find((item) => item.key === fontSizePreset)
        ?.label ??
      fontSizePresetOptions[1]?.label ??
      "",
    [fontSizePreset, fontSizePresetOptions],
  );

  const storageUsageBreakdown = useMemo(() => {
    const rows = [
      {
        key: "system",
        label: tt("appText.system"),
        bytes: Math.max(
          0,
          Number(systemStorageUsage?.categories.systemSettingsBytes ?? 0),
        ),
      },
      {
        key: "kline",
        label: tt("appText.lineData"),
        bytes: Math.max(
          0,
          Number(systemStorageUsage?.categories.marketDataBytes ?? 0),
        ),
      },
      {
        key: "training",
        label: tt("appText.trainingData"),
        bytes: Math.max(
          0,
          Number(systemStorageUsage?.categories.trainingDataBytes ?? 0),
        ),
      },
      {
        key: "notes",
        label: tt("appText.notesData"),
        bytes: Math.max(
          0,
          Number(systemStorageUsage?.categories.replayNotesBytes ?? 0),
        ),
      },
      {
        key: "stats",
        label: tt("appText.statsData"),
        bytes: Math.max(
          0,
          Number(systemStorageUsage?.categories.statsDataBytes ?? 0),
        ),
      },
      {
        key: "other",
        label: tt("appText.other2"),
        bytes: Math.max(
          0,
          Number(systemStorageUsage?.categories.otherBytes ?? 0),
        ),
      },
    ] as const;

    const categoryRows = rows.map((row) => ({ ...row }));
    const categoryRowTotal = categoryRows.reduce(
      (sum, row) => sum + row.bytes,
      0,
    );
    const rawPhysicalTotalBytes = Number(
      systemStorageUsage?.physicalTotalBytes ?? Number.NaN,
    );
    const rawLogicalTotalBytes = Number(
      systemStorageUsage?.logicalTotalBytes ?? Number.NaN,
    );
    const totalBytes =
      Number.isFinite(rawPhysicalTotalBytes) && rawPhysicalTotalBytes >= 0
        ? Math.floor(rawPhysicalTotalBytes)
        : Number.isFinite(rawLogicalTotalBytes) && rawLogicalTotalBytes >= 0
          ? Math.floor(rawLogicalTotalBytes)
          : categoryRowTotal;
    return {
      categoryRows,
      totalBytes,
    };
  }, [language, systemStorageUsage]);

  const storageUsageRows = storageUsageBreakdown.categoryRows;
  const storageUsageTotalText = useMemo(
    () => formatStorageBytes(storageUsageBreakdown.totalBytes),
    [formatStorageBytes, storageUsageBreakdown.totalBytes],
  );

  return {
    activeLanguageLabel,
    activeThemeLabel,
    activeFontSizeLabel,
    storageUsageRows,
    storageUsageTotalText,
  };
};

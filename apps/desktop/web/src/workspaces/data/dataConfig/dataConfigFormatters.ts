// SPDX-License-Identifier: GPL-3.0-only

import type { AppUiLanguage } from "@/ui/config/uiConfig";
import type { AppTextKey } from "@/frontend-kernel/i18n/messageRuntime";
import type { PoolSettingsRow } from "@/workspaces/data/dataConfig/model";

export const formatDataConfigSyncScopeLabel = ({
  strategy,
  topLevelSubfolder,
  tt,
  ttf,
}: {
  strategy: PoolSettingsRow["importScopeStrategy"];
  topLevelSubfolder: string;
  tt: (key: AppTextKey) => string;
  ttf: (key: AppTextKey, values?: Array<unknown>) => string;
}): string => {
  if (strategy === "WITH_PARENT") {
    return ttf("appText.topLevelSubfolderValue0", [
      topLevelSubfolder || "--",
    ]);
  }
  return tt("appText.wholeFolder");
};

export const formatDataConfigLocalizedDateTime = (
  value: string | null,
  language: AppUiLanguage,
  tt: (key: AppTextKey) => string,
): string => {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return tt("appText.syncHistory");
  }
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return normalized;
  }
  try {
    return new Intl.DateTimeFormat(language, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(parsed);
  } catch {
    return parsed.toLocaleString();
  }
};

// SPDX-License-Identifier: GPL-3.0-only

import fs from "node:fs";
import path from "node:path";
import {
  APP_LOCALES,
  MESSAGE_IDS,
  PSEUDO_LOCALE,
  formatMessage,
  loadLocaleCatalog,
  resolveLocaleWidthProfile,
} from "@zinuto/shared/i18n";

const frontendRoot = path.resolve(import.meta.dirname, "..");
const reportRoot = path.join(frontendRoot, "reports");
const reportJsonPath = path.join(reportRoot, "i18n-page-audit-report.json");
const reportMdPath = path.join(reportRoot, "i18n-page-audit-report.md");

const locales = [...APP_LOCALES, PSEUDO_LOCALE] as const;

const readUiConfigBundleValue = (
  locale: (typeof locales)[number],
  key: string,
): string => {
  const catalog = loadLocaleCatalog(
    locale === PSEUDO_LOCALE ? "en" : locale,
    "uiConfig" as never,
  ) as Readonly<Record<string, string>>;
  return String(catalog[key] ?? "");
};

const parseUiConfigBundle = <T,>(
  locale: (typeof locales)[number],
  key: string,
  fallback: T,
): T => {
  try {
    return JSON.parse(readUiConfigBundleValue(locale, key)) as T;
  } catch {
    return fallback;
  }
};

const buildSamples = (locale: (typeof locales)[number]) => ({
  shell: {
    commandCenter: formatMessage(locale, "shell.navigation.item.commandCenter"),
    trainer: formatMessage(locale, "shell.navigation.item.trainer"),
    history: formatMessage(locale, "shell.navigation.item.history"),
    settings: formatMessage(locale, "shell.navigation.item.settings"),
  },
  settings: {
    fontSize: formatMessage(locale, "settings.general.fontSize.title"),
    globalFont: formatMessage(locale, "settings.general.globalFont.description", {
      value: formatMessage(
        locale,
        "settings.general.fontSize.option.standard",
      ),
    }),
    sessionNameFormat: formatMessage(
      locale,
      "settings.general.sessionNameFormat.title",
    ),
    tradePalette: formatMessage(locale, "settings.general.tradeColorTheme.title"),
  },
  trainer: {
    cardTitle: formatMessage(locale, "trainer.position.cardTitle"),
    accountSettings: formatMessage(
      locale,
      "trainer.position.accountSettings",
    ),
    totalAsset: formatMessage(locale, "trainer.position.totalAsset"),
    availableCash: formatMessage(locale, "trainer.position.availableCash"),
    cumulativePnl: formatMessage(locale, "trainer.position.cumulativePnl"),
  },
  dialogs: {
    cancel: formatMessage(locale, "dialogs.action.cancel"),
    confirmDelete: formatMessage(locale, "dialogs.action.confirmDelete"),
    resetTitle: formatMessage(locale, "dialogs.reset.oneClickTitle"),
    clearPoolsTitle: formatMessage(locale, "dialogs.localData.clearPoolsTitle"),
  },
  portableTransfer: (() => {
    const bundle = parseUiConfigBundle<{
      sectionTitle?: string;
      exportCardTitle?: string;
      importDialogTitle?: string;
    }>(locale, "portableDataTransfer.bundle", {});
    return {
      sectionTitle: bundle.sectionTitle ?? "",
      exportCardTitle: bundle.exportCardTitle ?? "",
      importDialogTitle: bundle.importDialogTitle ?? "",
    };
  })(),
});

const report = locales.map((locale) => ({
  locale,
  widthProfile: resolveLocaleWidthProfile(locale),
  samples: buildSamples(locale),
}));

const markdown = [
  "# I18N Page Audit Report",
  "",
  `- GeneratedAt: ${new Date().toISOString()}`,
  `- Locales: ${locales.join(", ")}`,
  `- TotalLanguages: ${locales.length}`,
  "",
  "## Scope",
  "",
  "- Shell navigation labels",
  "- Settings row titles and descriptions",
  "- Trainer position card labels",
  "- Utility dialog labels",
  "- Portable transfer bundle copy",
  "- Pseudo-locale expansion smoke",
  "",
  ...report.flatMap((entry) => [
    `## ${entry.locale}`,
    "",
    `- WidthProfile: ${entry.widthProfile}`,
    `- Shell / Command Center: ${entry.samples.shell.commandCenter}`,
    `- Shell / Trainer: ${entry.samples.shell.trainer}`,
    `- Shell / History: ${entry.samples.shell.history}`,
    `- Shell / Settings: ${entry.samples.shell.settings}`,
    `- Settings / Font Size: ${entry.samples.settings.fontSize}`,
    `- Settings / Global Font: ${entry.samples.settings.globalFont}`,
    `- Settings / Session Name: ${entry.samples.settings.sessionNameFormat}`,
    `- Settings / Trade Palette: ${entry.samples.settings.tradePalette}`,
    `- Trainer / Card Title: ${entry.samples.trainer.cardTitle}`,
    `- Trainer / Account Settings: ${entry.samples.trainer.accountSettings}`,
    `- Trainer / Total Asset: ${entry.samples.trainer.totalAsset}`,
    `- Trainer / Available Cash: ${entry.samples.trainer.availableCash}`,
    `- Trainer / Cumulative PnL: ${entry.samples.trainer.cumulativePnl}`,
    `- Dialogs / Cancel: ${entry.samples.dialogs.cancel}`,
    `- Dialogs / Confirm Delete: ${entry.samples.dialogs.confirmDelete}`,
    `- Dialogs / Reset Title: ${entry.samples.dialogs.resetTitle}`,
    `- Dialogs / Clear Pools: ${entry.samples.dialogs.clearPoolsTitle}`,
    `- Portable Transfer / Section: ${entry.samples.portableTransfer.sectionTitle}`,
    `- Portable Transfer / Export Card: ${entry.samples.portableTransfer.exportCardTitle}`,
    `- Portable Transfer / Import Dialog: ${entry.samples.portableTransfer.importDialogTitle}`,
    "",
  ]),
].join("\n");

fs.mkdirSync(reportRoot, { recursive: true });
fs.writeFileSync(reportJsonPath, JSON.stringify(report, null, 2));
fs.writeFileSync(reportMdPath, markdown);

console.log(`Generated page-audit report: ${path.relative(frontendRoot, reportJsonPath)}`);
console.log(`Generated page-audit report: ${path.relative(frontendRoot, reportMdPath)}`);
console.log(`Summary => locales: ${locales.length}, semanticMessages: ${MESSAGE_IDS.length}`);

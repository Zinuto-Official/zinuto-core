// SPDX-License-Identifier: GPL-3.0-only

import React, { Suspense, lazy, useEffect, useMemo } from "react";
import ReactDOM from "react-dom/client";
import { Button } from "../src/ui/primitives/button";
import { SelectField } from "../src/ui/primitives/select-field";
import { SegmentedControl } from "../src/ui/primitives/segmented-control";
import { buildGlobalVisualCssVariables } from "../src/ui/theme/visualColors";
import type { NoticeDialogState } from "../src/app-shell/AppUtilityDialogs";
import {
  resolveTypographyScriptGroup,
  setGlobalTypographyContext,
} from "../src/frontend-kernel/typography";
import { I18nProvider, installI18nAuditBridge, useI18n } from "../src/frontend-kernel/i18n";
import {
  SidebarNav,
  SettingRow,
  StandardModalFrame,
} from "../src/ui/components";
import { CardContent, CardHeader, CardTitle } from "../src/ui/primitives/card";
import { SurfaceCard } from "../src/ui/primitives/surface-card";
import { ThemeProvider } from "../src/ui/theme/ThemeProvider";
import {
  formatMessage,
  ensureLocaleCatalog,
  resolveSupportedLocale,
  type SupportedLocale,
} from "@zinuto/shared/i18n";
import "../src/styles/index.css";

const query = new URLSearchParams(window.location.search);
const locale = resolveSupportedLocale(query.get("locale")) as SupportedLocale;
const noop = (): void => {};

const AppUtilityDialogs = lazy(() =>
  import("../src/app-shell/AppUtilityDialogs").then((module) => ({
    default: module.AppUtilityDialogs,
  })),
);

const HarnessBody = () => {
  const { locale: activeLocale, widthProfile, t } = useI18n();

  useEffect(() => installI18nAuditBridge(), []);

  const typography = useMemo(
    () =>
      setGlobalTypographyContext({
        language:
          activeLocale === "en-XA" ? "en" : activeLocale,
        fontSizePreset: "STANDARD",
      }),
    [activeLocale],
  );

  const rootStyle = useMemo(
    () =>
      ({
        ...typography.cssVariables,
        ...buildGlobalVisualCssVariables(
          "light",
          "RED_UP_GREEN_DOWN",
          "INSTITUTIONAL",
        ),
        padding: 0,
        boxSizing: "border-box",
        width: "100%",
        maxWidth: "100%",
        overflow: "auto",
      }) as React.CSSProperties,
    [typography.cssVariables],
  );

  const groups = useMemo(
    () => [
      {
        key: "command",
        label: t("shell.navigation.group.command"),
        items: [
          {
            key: "command-center",
            label: t("shell.navigation.item.commandCenter"),
            icon: "navCommandCenter" as const,
            onClick: noop,
            active: true,
          },
        ],
      },
      {
        key: "training",
        label: t("shell.navigation.group.training"),
        items: [
          {
            key: "trainer",
            label: t("shell.navigation.item.trainer"),
            icon: "navTrainer" as const,
            onClick: noop,
          },
          {
            key: "special",
            label: t("shell.navigation.item.specialTraining"),
            icon: "navChallengeHall" as const,
            onClick: noop,
          },
          {
            key: "history",
            label: t("shell.navigation.item.history"),
            icon: "navHistory" as const,
            onClick: noop,
          },
        ],
      },
      {
        key: "system",
        label: t("shell.navigation.group.tools"),
        items: [
          {
            key: "custom",
            label: t("shell.navigation.item.customIndicator"),
            icon: "navCustomIndicator" as const,
            onClick: noop,
          },
          {
            key: "data",
            label: t("shell.navigation.item.data"),
            icon: "navData" as const,
            onClick: noop,
          },
          {
            key: "settings",
            label: t("shell.navigation.item.settings"),
            icon: "settingsGear" as const,
            onClick: noop,
          },
        ],
      },
    ],
    [t],
  );

  const noticeDialog: NoticeDialogState = {
    id: "harness-notice",
    title: t("shell.navigation.item.commandCenter"),
    message: `${t("settings.general.globalFont.description", {
      value: t("shell.navigation.item.settings"),
    })} / ${t("trainer.position.accountSettings")}`,
    severity: "notice",
  };

  return (
    <div
      className="app-root theme-light price-scheme-red-up font-size-standard layout-constrained"
      style={rootStyle}
      lang={activeLocale === "en-XA" ? "en" : activeLocale}
      data-ui-language={activeLocale}
      data-script-group={resolveTypographyScriptGroup(
        activeLocale === "en-XA" ? "en" : activeLocale,
      )}
      data-locale-width-profile={widthProfile}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr)",
          gap: "20px",
          alignItems: "start",
          minHeight: "100%",
          minWidth: 0,
          width: "100%",
          maxWidth: "100%",
          boxSizing: "border-box",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <SidebarNav
            brandName={formatMessage(activeLocale, "shell.brand.name")}
            brandLogo=""
            brandLogoAlt={formatMessage(activeLocale, "shell.brand.logoAlt")}
            groups={groups}
            brandNode={
              <div className="sidebar-brand-main">
                <div className="sidebar-brand-copy">
                  <span className="sidebar-brand-name">
                    {formatMessage(activeLocale, "shell.brand.name")}
                  </span>
                </div>
              </div>
            }
          />
        </div>

        <div
          style={{
            display: "grid",
            gap: "20px",
            minWidth: 0,
            alignContent: "start",
          }}
        >
          <section
            className="settings-system-flow"
            style={{ display: "grid", gap: "0", minWidth: 0 }}
          >
            <SettingRow
              title={t("settings.general.language.title")}
              description={t("settings.general.globalFont.description", {
                value: t("shell.navigation.item.commandCenter"),
              })}
              control={
                <SelectField
                  className="settings-language-select"
                  value={activeLocale}
                  aria-label={t("settings.general.language.title")}
                  options={[
                    { value: "en", label: formatMessage("en", "shell.navigation.item.settings") },
                    { value: "zh-CN", label: formatMessage("zh-CN", "shell.navigation.item.settings") },
                    { value: "ja", label: formatMessage("ja", "shell.navigation.item.settings") },
                    { value: "ko", label: formatMessage("ko", "shell.navigation.item.settings") },
                    { value: "es", label: formatMessage("es", "shell.navigation.item.settings") },
                  ]}
                />
              }
            />
            <SettingRow
              title={t("settings.general.tradeColorTheme.title")}
              description={t("settings.general.sessionNameFormat.title")}
              control={
                <SegmentedControl
                  className="settings-theme-switch"
                  value="A"
                  onChange={() => undefined}
                  options={[
                    {
                      value: "A",
                      label: t("shell.navigation.item.commandCenter"),
                    },
                    {
                      value: "B",
                      label: t("shell.navigation.item.specialTraining"),
                    },
                    {
                      value: "C",
                      label: t("shell.navigation.item.customIndicator"),
                    },
                  ]}
                />
              }
            />
          </section>

          <SurfaceCard className="trainer-current-position-card">
            <CardHeader className="mb-0 flex items-center justify-between gap-2 px-3 py-3">
              <CardTitle className="text-r3 text-text-primary">
              <div className="position-card-title-row">
                <span data-i18n-slot="cardTitle" data-i18n-critical="true">
                  {t("trainer.position.cardTitle")}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  className="position-market-preset-trigger h-auto whitespace-normal py-2"
                >
                  <span
                    className="position-market-preset-trigger-label whitespace-normal text-left"
                    data-i18n-slot="buttonLabel"
                    data-i18n-critical="true"
                  >
                    {t("shell.navigation.item.specialTraining")}
                  </span>
                </Button>
              </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <div className="position-grid">
                {[
                  t("trainer.position.totalAsset"),
                  t("trainer.position.positionValue"),
                  t("trainer.position.positionQuantity"),
                  t("trainer.position.availableCash"),
                  t("trainer.position.fees"),
                  t("trainer.position.floatingPnl"),
                  t("trainer.position.cumulativePnl"),
                ].map((label, index) => (
                  <div
                    key={label}
                    className={`position-item ${index === 0 ? "span-2 position-item-account-total" : ""}`}
                  >
                    <span
                      className="position-label"
                      data-i18n-slot="metricLabel"
                      data-i18n-critical="true"
                    >
                      {label}
                    </span>
                    <span className="position-value" data-i18n-slot="metricValue">
                      123456.78
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </SurfaceCard>

          <div className="app-modal-surface" data-preset="alert" style={{ padding: 0 }}>
            <StandardModalFrame
              variant="alert"
              title={
                <div data-i18n-slot="cardTitle" data-i18n-critical="true">
                  {t("shell.navigation.item.specialTraining")}
                </div>
              }
              description={
                <div
                  data-i18n-slot="bodyCopy"
                  data-i18n-critical="true"
                >
                  {`${t("settings.general.globalFont.description", {
                    value: t("shell.navigation.item.history"),
                  })} / ${t("shell.navigation.item.commandCenter")}`}
                </div>
              }
              actions={
                <>
                  <Button type="button" variant="outline">
                    <span
                      data-i18n-slot="buttonLabel"
                      data-i18n-critical="true"
                    >
                      {t("shell.navigation.item.history")}
                    </span>
                  </Button>
                  <Button type="button" variant="outline">
                    <span
                      data-i18n-slot="buttonLabel"
                      data-i18n-critical="true"
                    >
                      {t("shell.navigation.item.specialTraining")}
                    </span>
                  </Button>
                  <Button type="button">
                    <span
                      data-i18n-slot="buttonLabel"
                      data-i18n-critical="true"
                    >
                      {t("shell.navigation.item.commandCenter")}
                    </span>
                  </Button>
                </>
              }
            />
          </div>

          <Suspense fallback={null}>
            <AppUtilityDialogs
              actionDialogOpen={false}
              noticeDialog={noticeDialog}
              noticeCountdownSec={5}
              onCloseNoticeDialog={() => undefined}
              orderEndPrompt={null}
              onCloseOrderEndPrompt={() => undefined}
              onConfirmOrderEndPrompt={() => undefined}
              compactScriptLanguage={widthProfile === "compact"}
              tt={() => ""}
              ttf={() => ""}
            />
          </Suspense>
        </div>
      </div>
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById("root")!);
await ensureLocaleCatalog(locale);
root.render(
  <ThemeProvider mode="light" resolvedMode="light">
    <I18nProvider locale={locale}>
      <HarnessBody />
    </I18nProvider>
  </ThemeProvider>,
);

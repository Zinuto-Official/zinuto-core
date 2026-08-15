// SPDX-License-Identifier: GPL-3.0-only

import type { UiLanguage } from "@/frontend-kernel/typography";
import { memo, type ComponentProps } from "react";
import { AppRootDesktopShell } from "@/app-shell/AppRootDesktopShell";
import { resolveTypographyScriptGroup } from "@/frontend-kernel/typography";
import { I18nProvider } from "@/frontend-kernel/i18n";
import { GRAPHIC_IMAGE_ASSET_URLS } from "@/assets/graphics";
import { formatMessage } from "@zinuto/shared/i18n";
import { DesktopBrandEntry } from "@/domains/community/DesktopBrandEntry";

type AppRootDesktopShellProps = ComponentProps<typeof AppRootDesktopShell>;

export type RuntimeDesktopShellRendererArgs = {
  language: UiLanguage;
  themeMode: AppRootDesktopShellProps["themeMode"];
  resolvedThemeMode: AppRootDesktopShellProps["resolvedThemeMode"];
  priceColorMode: string;
  fontSizePreset: string;
  viewportLayoutMode: string;
  activePage: string;
  showDesktopHelpLauncher: AppRootDesktopShellProps["showDesktopHelpLauncher"];
  setShowDesktopHelpLauncher: AppRootDesktopShellProps["setShowDesktopHelpLauncher"];
  onNavigateToDesktopHelpTarget: AppRootDesktopShellProps["onNavigateToDesktopHelpTarget"];
  rootStyle: AppRootDesktopShellProps["rootStyle"];
  rootLocaleWidthProfile: AppRootDesktopShellProps["rootLocaleWidthProfile"];
  onMouseDownCapture: AppRootDesktopShellProps["onMouseDownCapture"];
  onMouseMoveCapture: AppRootDesktopShellProps["onMouseMoveCapture"];
  onMouseUpCapture: AppRootDesktopShellProps["onMouseUpCapture"];
  onMouseLeave: AppRootDesktopShellProps["onMouseLeave"];
  onDoubleClickCapture: AppRootDesktopShellProps["onDoubleClickCapture"];
  sidebarGroups: AppRootDesktopShellProps["sidebarGroups"];
  workspaceSwitcherProps: AppRootDesktopShellProps["workspaceSwitcherProps"];
  onboardingTourStatus: AppRootDesktopShellProps["onboardingTourStatus"];
  onboardingTourStep: AppRootDesktopShellProps["onboardingTourStep"];
  onOnboardingTourStatusChange: AppRootDesktopShellProps["onOnboardingTourStatusChange"];
  onOnboardingTourStepChange: AppRootDesktopShellProps["onOnboardingTourStepChange"];
  trainerModalHostProps: AppRootDesktopShellProps["trainerModalHostProps"];
  utilityDialogsProps: AppRootDesktopShellProps["utilityDialogsProps"];
  actionDialogNode: AppRootDesktopShellProps["actionDialogNode"];
};

const MemoDesktopBrandEntry = memo(DesktopBrandEntry);

const buildRootClassName = ({
  resolvedThemeMode,
  priceColorMode,
  fontSizePreset,
  viewportLayoutMode,
}: Pick<
  RuntimeDesktopShellRendererArgs,
  "resolvedThemeMode" | "priceColorMode" | "fontSizePreset" | "viewportLayoutMode"
>): string =>
  `app-root theme-${resolvedThemeMode} ${
    priceColorMode === "GREEN_UP_RED_DOWN"
      ? "price-scheme-green-up"
      : "price-scheme-red-up"
  } font-size-${fontSizePreset.toLowerCase()} layout-${viewportLayoutMode}`;

const buildMainClassName = (activePage: string): string =>
  `desktop-main ${activePage === "TRAINER" ? "is-trainer" : "is-single-page"} ${
    activePage === "SPECIAL_TRAINING" ? "is-special-training" : ""
  }`;

export const renderRuntimeDesktopShell = ({
  language,
  themeMode,
  resolvedThemeMode,
  priceColorMode,
  fontSizePreset,
  viewportLayoutMode,
  activePage,
  showDesktopHelpLauncher,
  setShowDesktopHelpLauncher,
  onNavigateToDesktopHelpTarget,
  rootStyle,
  rootLocaleWidthProfile,
  onMouseDownCapture,
  onMouseMoveCapture,
  onMouseUpCapture,
  onMouseLeave,
  onDoubleClickCapture,
  sidebarGroups,
  workspaceSwitcherProps,
  onboardingTourStatus,
  onboardingTourStep,
  onOnboardingTourStatusChange,
  onOnboardingTourStepChange,
  trainerModalHostProps,
  utilityDialogsProps,
  actionDialogNode,
}: RuntimeDesktopShellRendererArgs) => {
  const brandName = formatMessage(language, "shell.brand.name");
  const brandLogoAlt = formatMessage(language, "shell.brand.logoAlt");
  return (
    <I18nProvider locale={language}>
      <AppRootDesktopShell
        themeMode={themeMode}
        resolvedThemeMode={resolvedThemeMode}
        rootClassName={buildRootClassName({
          resolvedThemeMode,
          priceColorMode,
          fontSizePreset,
          viewportLayoutMode,
        })}
        rootStyle={rootStyle}
        rootLang={language}
        rootUiLanguage={language}
        rootScriptGroup={resolveTypographyScriptGroup(language)}
        rootLocaleWidthProfile={rootLocaleWidthProfile}
        onMouseDownCapture={onMouseDownCapture}
        onMouseMoveCapture={onMouseMoveCapture}
        onMouseUpCapture={onMouseUpCapture}
        onMouseLeave={onMouseLeave}
        onDoubleClickCapture={onDoubleClickCapture}
        sidebarGroups={sidebarGroups}
        sidebarClassName={
          workspaceSwitcherProps.trainerWorkspacePageProps.freeReplaySetup
            .isPrepMode
            ? "is-trainer-prep-brand-raised"
            : undefined
        }
        brandName={brandName}
        brandLogoAlt={brandLogoAlt}
        mainClassName={buildMainClassName(activePage)}
        showDesktopHelpLauncher={showDesktopHelpLauncher}
        setShowDesktopHelpLauncher={setShowDesktopHelpLauncher}
        onNavigateToDesktopHelpTarget={onNavigateToDesktopHelpTarget}
        workspaceSwitcherProps={workspaceSwitcherProps}
        onboardingTourStatus={onboardingTourStatus}
        onboardingTourStep={onboardingTourStep}
        onOnboardingTourStatusChange={onOnboardingTourStatusChange}
        onOnboardingTourStepChange={onOnboardingTourStepChange}
        trainerModalHostProps={trainerModalHostProps}
        utilityDialogsProps={utilityDialogsProps}
        actionDialogNode={actionDialogNode}
        brandNode={
          <MemoDesktopBrandEntry
            brandName={brandName}
            brandLogo={GRAPHIC_IMAGE_ASSET_URLS.brandLogoRounded}
            brandLogoAlt={brandLogoAlt}
          />
        }
      />
    </I18nProvider>
  );
};

// SPDX-License-Identifier: GPL-3.0-only

import type {
  CSSProperties,
  ComponentProps,
  Dispatch,
  MouseEventHandler,
  ReactNode,
  SetStateAction,
} from "react";
import {
  useMemo,
  useCallback,
  useState,
  memo,
} from "react";
import { APP_PORTAL_ROOT_ID } from "@/ui/primitives/portalContainer";
import { ThemeProvider } from "@/ui/theme/ThemeProvider";
import { AppShell, SidebarNav } from "@/ui/components";
import { GRAPHIC_IMAGE_ASSET_URLS } from "@/assets/graphics";
import { WorkspacePageSwitcher } from "@/workspaces";
import {
  DesktopOnboardingTour,
} from "@/app-shell/onboarding/DesktopOnboardingTour";
import type {
  DesktopOnboardingTargetId,
  DesktopOnboardingTourStatus,
  DesktopOnboardingTourStep,
} from "@/domains/onboarding/desktopOnboardingModel";
import type { AppTrainerModalHostProps } from "@/app-shell/AppTrainerModalHost";
import type { AppUtilityDialogsProps } from "@/app-shell/AppUtilityDialogs";
import type { WorkspacePage } from "@/frontend-kernel/workspacePageModel";
import { tt } from "@/frontend-kernel/i18n/messageRuntime";
import { RetryableLazyModuleSurface } from "@/frontend-kernel/RetryableLazyModuleSurface";
import { Button } from "@/ui/primitives/button";
import { DesktopHelpContextProvider } from "@/domains/desktop-help/DesktopHelpContext";
import { DesktopHelpFloatingHost } from "@/domains/desktop-help/DesktopHelpFloatingHost";
import { DesktopWindowChrome } from "@/ui/components/DesktopWindowChrome";
import { shouldUseCustomDesktopWindowChrome } from "@/api";
import type {
  DesktopHelpNavigationTarget,
} from "@/domains/desktop-help/desktopHelpTypes";

const loadAppTrainerModalHost = () =>
  import("@/app-shell/AppTrainerModalHost").then((module) => ({
    default: module.AppTrainerModalHost,
  }));
const loadAppUtilityDialogs = () =>
  import("@/app-shell/AppUtilityDialogs").then((module) => ({
    default: module.AppUtilityDialogs,
  }));

const OptionalModuleRecovery = ({
  className,
  onRetry,
}: {
  className: string;
  onRetry: () => void;
}) => (
  <div
    className={`app-lazy-module-recovery ${className}`}
    role="alert"
    aria-live="assertive"
  >
    <span>{tt("common.status.loadFailed")}</span>
    <Button type="button" size="sm" variant="secondary" onClick={onRetry}>
      {tt("appText.retry")}
    </Button>
  </div>
);

type AppRootChartNoteHover = {
  pageX: number;
  pageY: number;
  title: string;
};

const buildDesktopMainClassName = (page: string): string =>
  `desktop-main ${page === "TRAINER" ? "is-trainer" : "is-single-page"} ${
    page === "SPECIAL_TRAINING" ? "is-special-training" : ""
  }`;

export type AppRootDesktopShellProps = {
  themeMode: ComponentProps<typeof ThemeProvider>["mode"];
  resolvedThemeMode: NonNullable<
    ComponentProps<typeof ThemeProvider>["resolvedMode"]
  >;
  rootClassName: string;
  rootStyle: CSSProperties;
  rootLang: string;
  rootUiLanguage: string;
  rootScriptGroup: string;
  rootLocaleWidthProfile: string;
  onMouseDownCapture: MouseEventHandler<HTMLDivElement>;
  onMouseMoveCapture: MouseEventHandler<HTMLDivElement>;
  onMouseUpCapture: MouseEventHandler<HTMLDivElement>;
  onMouseLeave: MouseEventHandler<HTMLDivElement>;
  onDoubleClickCapture: MouseEventHandler<HTMLDivElement>;
  sidebarGroups: ComponentProps<typeof SidebarNav>["groups"];
  sidebarClassName?: string;
  brandName: string;
  brandLogoAlt: string;
  mainClassName: string;
  showDesktopHelpLauncher: boolean;
  setShowDesktopHelpLauncher: Dispatch<SetStateAction<boolean>>;
  onNavigateToDesktopHelpTarget: (target: DesktopHelpNavigationTarget) => void;
  workspaceSwitcherProps: ComponentProps<typeof WorkspacePageSwitcher>;
  onboardingTourStatus: DesktopOnboardingTourStatus;
  onboardingTourStep: DesktopOnboardingTourStep;
  onOnboardingTourStatusChange: (status: DesktopOnboardingTourStatus) => void;
  onOnboardingTourStepChange: (step: DesktopOnboardingTourStep) => void;
  chartNoteHover: AppRootChartNoteHover | null;
  trainerModalHostProps: AppTrainerModalHostProps;
  utilityDialogsProps: AppUtilityDialogsProps;
  actionDialogNode: ReactNode;
  brandNode: ReactNode;
};

export const AppRootDesktopShell = memo(({
  themeMode,
  resolvedThemeMode,
  rootClassName,
  rootStyle,
  rootLang,
  rootUiLanguage,
  rootScriptGroup,
  rootLocaleWidthProfile,
  onMouseDownCapture,
  onMouseMoveCapture,
  onMouseUpCapture,
  onMouseLeave,
  onDoubleClickCapture,
  sidebarGroups,
  sidebarClassName,
  brandName,
  brandLogoAlt,
  mainClassName,
  showDesktopHelpLauncher,
  setShowDesktopHelpLauncher,
  onNavigateToDesktopHelpTarget,
  workspaceSwitcherProps,
  onboardingTourStatus,
  onboardingTourStep,
  onOnboardingTourStatusChange,
  onOnboardingTourStepChange,
  chartNoteHover,
  trainerModalHostProps,
  utilityDialogsProps,
  actionDialogNode,
  brandNode,
}: AppRootDesktopShellProps) => {
  const [activeOnboardingTargetId, setActiveOnboardingTargetId] =
    useState<DesktopOnboardingTargetId | null>(null);
  const [displayedWorkspacePage, setDisplayedWorkspacePage] = useState(
    workspaceSwitcherProps.activePage,
  );
  const handleDisplayedWorkspacePageChange = useCallback(
    (page: WorkspacePage) => {
      setDisplayedWorkspacePage(page);
      workspaceSwitcherProps.onDisplayedPageChange?.(page);
    },
    [workspaceSwitcherProps.onDisplayedPageChange],
  );
  const hasUnlockedLocalImportSource =
    workspaceSwitcherProps.dataConfigPageProps.poolSettingsRows.some(
      (pool) => !pool.isSystem && !pool.sourceLocked,
    );
  const handleRestartOnboarding = useCallback(() => {
    onOnboardingTourStatusChange("ACTIVE");
    onOnboardingTourStepChange("MODE_OVERVIEW");
    workspaceSwitcherProps.onSelectPage("COMMAND_CENTER");
  }, [
    onOnboardingTourStatusChange,
    onOnboardingTourStepChange,
    workspaceSwitcherProps.onSelectPage,
  ]);
  const workspaceSwitcherPropsWithOnboardingRestart = useMemo(
    () => ({
      ...workspaceSwitcherProps,
      onDisplayedPageChange: handleDisplayedWorkspacePageChange,
      systemSettingsPageProps: {
        ...workspaceSwitcherProps.systemSettingsPageProps,
        canRestartOnboarding: onboardingTourStatus !== "ACTIVE",
        onRestartOnboarding: handleRestartOnboarding,
      },
    }),
    [
      handleDisplayedWorkspacePageChange,
      handleRestartOnboarding,
      onboardingTourStatus,
      workspaceSwitcherProps,
    ],
  );
  const resolvedMainClassName =
    displayedWorkspacePage
      ? buildDesktopMainClassName(displayedWorkspacePage)
      : mainClassName;
  const customWindowChromeEnabled = shouldUseCustomDesktopWindowChrome();

  return (
    <ThemeProvider mode={themeMode} resolvedMode={resolvedThemeMode}>
      <div
        className={rootClassName}
        style={rootStyle}
        lang={rootLang}
        data-ui-language={rootUiLanguage}
        data-script-group={rootScriptGroup}
        data-locale-width-profile={rootLocaleWidthProfile}
        data-zinuto-window-chrome={
          customWindowChromeEnabled ? "windows" : undefined
        }
        onMouseDownCapture={
          customWindowChromeEnabled ? undefined : onMouseDownCapture
        }
        onMouseMoveCapture={
          customWindowChromeEnabled ? undefined : onMouseMoveCapture
        }
        onMouseUpCapture={
          customWindowChromeEnabled ? undefined : onMouseUpCapture
        }
        onMouseLeave={customWindowChromeEnabled ? undefined : onMouseLeave}
        onDoubleClickCapture={
          customWindowChromeEnabled ? undefined : onDoubleClickCapture
        }
      >
        <DesktopWindowChrome
          dragHandlers={{
            onMouseDownCapture,
            onMouseMoveCapture,
            onMouseUpCapture,
            onMouseLeave,
            onDoubleClickCapture,
          }}
          logoAlt={brandLogoAlt}
          logoSrc={GRAPHIC_IMAGE_ASSET_URLS.brandLogoRounded}
          theme={resolvedThemeMode}
          title={brandName}
          variant="main"
        />
        <DesktopHelpContextProvider
          activeWorkspace={workspaceSwitcherProps.activePage}
          onNavigateToTarget={onNavigateToDesktopHelpTarget}
          showDesktopHelpLauncher={showDesktopHelpLauncher}
          setShowDesktopHelpLauncher={setShowDesktopHelpLauncher}
        >
        <AppShell
          className="desktop-shell is-sidebar-unified"
          sidebar={
            <SidebarNav
              brandName={brandName}
              brandLogo={GRAPHIC_IMAGE_ASSET_URLS.brandLogoRounded}
              brandLogoAlt={brandLogoAlt}
              groups={sidebarGroups}
              brandNode={brandNode}
              className={sidebarClassName}
            />
          }
          mainClassName={resolvedMainClassName}
        >
          <WorkspacePageSwitcher
            {...workspaceSwitcherPropsWithOnboardingRestart}
            onboardingTargetId={activeOnboardingTargetId}
          />
        </AppShell>

        <DesktopHelpFloatingHost
          onboardingActive={onboardingTourStatus === "ACTIVE"}
        />

        <DesktopOnboardingTour
          status={onboardingTourStatus}
          step={onboardingTourStep}
          activePage={workspaceSwitcherProps.activePage}
          hasUnlockedLocalImportSource={hasUnlockedLocalImportSource}
          onOpenLocalImport={
            workspaceSwitcherProps.dataConfigPageProps
              .openCsvFolderPickerAndPrepareImport
          }
          onSelectPage={workspaceSwitcherProps.onSelectPage}
          onStepChange={onOnboardingTourStepChange}
          onStatusChange={onOnboardingTourStatusChange}
          onTargetChange={setActiveOnboardingTargetId}
        />

        {chartNoteHover ? (
          <div
            className="chart-note-hover-tooltip"
            style={{
              left: `${chartNoteHover.pageX + 10}px`,
              top: `${chartNoteHover.pageY + 10}px`,
            }}
          >
            {chartNoteHover.title}
          </div>
        ) : null}

        <RetryableLazyModuleSurface
          componentProps={trainerModalHostProps}
          fallback={null}
          loader={loadAppTrainerModalHost}
          moduleName="APP_TRAINER_MODAL_HOST"
          renderError={({ retry }) => (
            <OptionalModuleRecovery
              className="is-trainer-modal-host"
              onRetry={retry}
            />
          )}
        />
        <RetryableLazyModuleSurface
          componentProps={utilityDialogsProps}
          fallback={null}
          loader={loadAppUtilityDialogs}
          moduleName="APP_UTILITY_DIALOGS"
          renderError={({ retry }) => (
            <OptionalModuleRecovery
              className="is-utility-dialogs"
              onRetry={retry}
            />
          )}
        />
        {actionDialogNode}
        <div id={APP_PORTAL_ROOT_ID} className="app-portal-root" />
        </DesktopHelpContextProvider>
      </div>
    </ThemeProvider>
  );
});

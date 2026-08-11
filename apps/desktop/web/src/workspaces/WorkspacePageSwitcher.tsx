// SPDX-License-Identifier: GPL-3.0-only

import {
  Component,
  Suspense,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type AnimationEvent,
  type ComponentType,
  type ReactNode,
} from "react";
import type { AppTextKey } from "@/frontend-kernel/i18n/messageRuntime";
import { PageLoadingState } from "@/ui/primitives/loading";
import { Button } from "@/ui/primitives/button";
import { WorkspaceFrameShell, WorkspacePageShell } from "@/ui/components";
import type { PageLayoutTemplate } from "@/ui/components/pageLayoutTypes";
import type { AppUiLanguage } from "@/ui/config/uiConfig";
import type { UiLabelEntry } from "@/ui/config/uiLabels";
import {
  getWorkspaceMotionDirection,
  getWorkspaceMotionSurface,
  WORKSPACE_KEEP_ALIVE_PAGES,
  type WorkspaceMotionSurface,
} from "@/frontend-kernel/workspacePageModel";
import type {
  SpecialTrainingChallengeReviewNoteRequest,
  SpecialTrainingChartSyncHandler,
  SpecialTrainingShortcutBindings,
} from "@/domains/special-training/specialTrainingContracts";
import type { PriceColorMode } from "@/domains/chart/display";
import type { WorkspacePage } from "@/frontend-kernel/workspacePageModel";
import type { NotesPageProps } from "@/workspaces/notes/NotesPage";
import type { DesktopOnboardingTargetId } from "@/domains/onboarding/desktopOnboardingModel";
import { useTrainingCommandCenterPageController } from "@/workspaces/command-center/useTrainingCommandCenterPageController";
import type { TrainerChartWorkspaceProps } from "@/domains/trainer/TrainerChartWorkspace";
import { TrainingCommandCenterPage } from "@/workspaces/command-center/TrainingCommandCenterPage";
import type { TrainerWorkspacePageProps } from "@/workspaces/trainer/TrainerWorkspacePage";
import type { DataConfigWorkspacePageProps } from "@/workspaces/data/DataConfigWorkspacePage";
import type { HistoryWorkspacePageProps } from "@/workspaces/history/HistoryWorkspacePage";
import type { SystemSettingsWorkspacePageProps } from "@/workspaces/settings/SystemSettingsWorkspacePage";
import type { StrategyBacktestSamplePool } from "@/workspaces/strategy-backtest/strategyBacktestTypes";
import { useWorkspacePageEntryModels } from "@/workspaces/useWorkspacePageEntryModels";
import { RetryableLazyModuleSurface } from "@/frontend-kernel/RetryableLazyModuleSurface";
import {
  WORKSPACE_PAGE_IDLE_PRELOAD_ORDER,
  loadChallengeStatsPage,
  loadCustomIndicatorSystemPage,
  loadDataConfigPage,
  loadHistoryPage,
  loadNotesPage,
  loadStrategyBacktestPage,
  loadSpecialTrainingPage,
  loadSystemSettingsPage,
  loadTrainerPage,
  normalizeWorkspacePageForCache,
  preloadWorkspacePageAssets,
  type CachedWorkspacePage,
} from "@/workspaces/workspacePageModulePreload";

const MemoTrainingCommandCenterPage = memo(TrainingCommandCenterPage);

const WORKSPACE_PAGE_RENDER_ORDER: CachedWorkspacePage[] = [
  "COMMAND_CENTER",
  "TRAINER",
  "SPECIAL_TRAINING",
  "HISTORY",
  "CHALLENGE_STATS",
  "STRATEGY_BACKTEST",
  "NOTES",
  "CUSTOM_INDICATOR",
  "DATA",
  "SETTINGS",
];

const WORKSPACE_PAGE_NAVIGATION_MOTION_FAILSAFE_MS = 600;

type WorkspacePageFallbackPresentation = {
  template: PageLayoutTemplate;
  className: string;
  bodyClassName: string;
};

type WorkspaceContinuitySkeletonVariant =
  | "overview"
  | "split-detail"
  | "workbench"
  | "workflow";

const WORKSPACE_PAGE_FALLBACK_PRESENTATION: Record<
  CachedWorkspacePage,
  WorkspacePageFallbackPresentation
> = {
  COMMAND_CENTER: {
    template: "overview",
    className: "training-command-center-page",
    bodyClassName: "training-command-center-page-body",
  },
  TRAINER: {
    template: "workbench",
    className: "trainer-workspace-page",
    bodyClassName: "trainer-workspace-body",
  },
  SPECIAL_TRAINING: {
    template: "workbench",
    className: "settings-page special-training-page is-mode-picker",
    bodyClassName: "special-training-body",
  },
  HISTORY: {
    template: "split-detail",
    className: "diagnostic-center-page workspace-page--section-surface-only",
    bodyClassName: "diagnostic-center-page-body",
  },
  CHALLENGE_STATS: {
    template: "overview",
    className: "training-stats-page workspace-page--section-surface-only",
    bodyClassName: "training-stats-page-body",
  },
  STRATEGY_BACKTEST: {
    template: "workbench",
    className: "strategy-backtest-page",
    bodyClassName: "strategy-backtest-page-body",
  },
  NOTES: {
    template: "split-detail",
    className: "history-page notes-page",
    bodyClassName: "notes-page-body",
  },
  CUSTOM_INDICATOR: {
    template: "workbench",
    className: "custom-indicator-page",
    bodyClassName: "custom-indicator-page-body",
  },
  DATA: {
    template: "workflow",
    className: "settings-page data-config-page data-asset-page",
    bodyClassName: "settings-page-content data-asset-page-body",
  },
  SETTINGS: {
    template: "workflow",
    className: "settings-page settings-redesign-page",
    bodyClassName: "settings-page-content settings-redesign-page-content",
  },
};

const WORKSPACE_CONTINUITY_SKELETON_VARIANTS: Record<
  PageLayoutTemplate,
  WorkspaceContinuitySkeletonVariant
> = {
  dialog: "workflow",
  overview: "overview",
  "split-detail": "split-detail",
  workbench: "workbench",
  workflow: "workflow",
};

const WORKSPACE_CONTINUITY_SKELETON_METRICS = [0, 1, 2] as const;
const WORKSPACE_CONTINUITY_SKELETON_ROWS = [0, 1, 2, 3] as const;

const renderWorkspaceContinuitySkeleton = (
  page: CachedWorkspacePage,
  label: ReactNode,
) => {
  const presentation = WORKSPACE_PAGE_FALLBACK_PRESENTATION[page];
  const variant =
    WORKSPACE_CONTINUITY_SKELETON_VARIANTS[presentation.template];
  return (
    <WorkspacePageShell
      template={presentation.template}
      className={`workspace-page-loading-shell workspace-page-continuity-shell ${presentation.className}`}
      bodyClassName={`workspace-page-loading-body workspace-page-continuity-body ${presentation.bodyClassName}`}
    >
      <WorkspaceFrameShell
        className={`workspace-continuity-skeleton workspace-continuity-skeleton--${variant}`}
        aria-hidden="true"
      >
        <div className="workspace-continuity-skeleton-head">
          <span className="workspace-continuity-skeleton-line is-title" />
          <span className="workspace-continuity-skeleton-line is-subtitle" />
        </div>
        <div className="workspace-continuity-skeleton-grid">
          {WORKSPACE_CONTINUITY_SKELETON_METRICS.map((item) => (
            <span
              key={`metric-${item}`}
              className="workspace-continuity-skeleton-card"
            >
              <span className="workspace-continuity-skeleton-line is-label" />
              <span className="workspace-continuity-skeleton-line is-value" />
            </span>
          ))}
        </div>
        <div className="workspace-continuity-skeleton-main">
          <span className="workspace-continuity-skeleton-panel is-primary">
            {WORKSPACE_CONTINUITY_SKELETON_ROWS.map((item) => (
              <span
                key={`primary-${item}`}
                className="workspace-continuity-skeleton-line"
              />
            ))}
          </span>
          <span className="workspace-continuity-skeleton-panel is-secondary">
            {WORKSPACE_CONTINUITY_SKELETON_ROWS.slice(0, 3).map((item) => (
              <span
                key={`secondary-${item}`}
                className="workspace-continuity-skeleton-line"
              />
            ))}
          </span>
        </div>
      </WorkspaceFrameShell>
      <span className="sr-only" role="status" aria-live="polite">
        {label}
      </span>
    </WorkspacePageShell>
  );
};

type WorkspacePageNavigationMotion = {
  direction: Exclude<ReturnType<typeof getWorkspaceMotionDirection>, "none">;
  epoch: number;
  page: CachedWorkspacePage;
  surface: WorkspaceMotionSurface;
};

type WorkspacePageLoadBoundaryProps = {
  page: CachedWorkspacePage;
  resetKey: string;
  loadFailedLabel: string;
  onRetry: () => void;
  retryLabel: string;
  children: ReactNode;
};

type WorkspacePageLoadBoundaryState = {
  hasError: boolean;
};

type WorkspacePageLoadFailureProps = {
  loadFailedLabel: string;
  onRetry: () => void;
  retryLabel: string;
};

const WorkspacePageLoadFailure = ({
  loadFailedLabel,
  onRetry,
  retryLabel,
}: WorkspacePageLoadFailureProps): ReactNode => (
  <section className="workspace-page">
    <PageLoadingState label={loadFailedLabel} />
    <div className="workspace-page-load-actions">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={onRetry}
      >
        {retryLabel}
      </Button>
    </div>
  </section>
);

class WorkspacePageLoadBoundary extends Component<
  WorkspacePageLoadBoundaryProps,
  WorkspacePageLoadBoundaryState
> {
  state: WorkspacePageLoadBoundaryState = { hasError: false };

  static getDerivedStateFromError(): WorkspacePageLoadBoundaryState {
    return { hasError: true };
  }

  componentDidUpdate(previousProps: WorkspacePageLoadBoundaryProps): void {
    if (
      this.state.hasError &&
      previousProps.resetKey !== this.props.resetKey
    ) {
      this.setState({ hasError: false });
    }
  }

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }
    return (
      <WorkspacePageLoadFailure
        loadFailedLabel={this.props.loadFailedLabel}
        retryLabel={this.props.retryLabel}
        onRetry={() => {
          this.setState({ hasError: false });
          this.props.onRetry();
          void preloadWorkspacePageAssets(this.props.page).catch(() => {
            this.setState({ hasError: true });
          });
        }}
      />
    );
  }
}

const areCachedPagesEqual = (
  left: CachedWorkspacePage[],
  right: CachedWorkspacePage[],
): boolean => {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
};

const loadWorkspacePageAfterAssets = <T,>(
  page: CachedWorkspacePage,
  moduleLoader: () => Promise<T>,
): Promise<T> =>
  preloadWorkspacePageAssets(page).then(() => moduleLoader());

const loadMemoizedWorkspacePageAfterAssets = <Props extends object>(
  page: CachedWorkspacePage,
  moduleLoader: () => Promise<{ default: ComponentType<Props> }>,
): Promise<{ default: ComponentType<Props> }> =>
  loadWorkspacePageAfterAssets(page, moduleLoader).then((module) => ({
    default: memo(module.default),
  }));

const WORKSPACE_PAGE_MODULE_LOADERS = {
  TRAINER: () => loadWorkspacePageAfterAssets("TRAINER", loadTrainerPage),
  SPECIAL_TRAINING: () =>
    loadMemoizedWorkspacePageAfterAssets(
      "SPECIAL_TRAINING",
      loadSpecialTrainingPage,
    ),
  HISTORY: () =>
    loadMemoizedWorkspacePageAfterAssets("HISTORY", loadHistoryPage),
  CHALLENGE_STATS: () =>
    loadMemoizedWorkspacePageAfterAssets(
      "CHALLENGE_STATS",
      loadChallengeStatsPage,
    ),
  STRATEGY_BACKTEST: () =>
    loadMemoizedWorkspacePageAfterAssets(
      "STRATEGY_BACKTEST",
      loadStrategyBacktestPage,
    ),
  NOTES: () =>
    loadMemoizedWorkspacePageAfterAssets("NOTES", loadNotesPage),
  CUSTOM_INDICATOR: () =>
    loadWorkspacePageAfterAssets(
      "CUSTOM_INDICATOR",
      loadCustomIndicatorSystemPage,
    ),
  DATA: () => loadWorkspacePageAfterAssets("DATA", loadDataConfigPage),
  SETTINGS: () =>
    loadMemoizedWorkspacePageAfterAssets("SETTINGS", loadSystemSettingsPage),
} as const;

type RetryableWorkspacePageSurfaceProps<Props extends object> = {
  componentProps: Props;
  fallback: ReactNode;
  loadFailedLabel: string;
  loader: () => Promise<{ default: ComponentType<Props> }>;
  moduleName: string;
  retryLabel: string;
};

const RetryableWorkspacePageSurface = <Props extends object>({
  componentProps,
  fallback,
  loadFailedLabel,
  loader,
  moduleName,
  retryLabel,
}: RetryableWorkspacePageSurfaceProps<Props>): ReactNode => (
  <RetryableLazyModuleSurface
    componentProps={componentProps}
    fallback={fallback}
    loader={loader}
    moduleName={moduleName}
    renderError={({ retry }) => (
      <WorkspacePageLoadFailure
        loadFailedLabel={loadFailedLabel}
        onRetry={retry}
        retryLabel={retryLabel}
      />
    )}
  />
);

type CommandCenterWorkspaceEntryProps = {
  normalizedActivePage: CachedWorkspacePage;
  onSelectPage: (page: WorkspacePage) => void;
  canResumeTrainerSession: boolean;
  onResumeTrainerSession: () => void;
  tt: (key: AppTextKey) => string;
  ui: UiLabelEntry;
  language: AppUiLanguage;
  trainerWorkspacePageProps: TrainerWorkspacePageProps;
  notesPageProps: NotesPageProps;
  navigateToSpecialTrainingMode: ReturnType<
    typeof useWorkspacePageEntryModels
  >["navigateToSpecialTrainingMode"];
  onStatsError: (message: string) => void;
};

const CommandCenterWorkspaceEntry = ({
  normalizedActivePage,
  onSelectPage,
  canResumeTrainerSession,
  onResumeTrainerSession,
  tt,
  ui,
  language,
  trainerWorkspacePageProps,
  notesPageProps,
  navigateToSpecialTrainingMode,
  onStatsError,
}: CommandCenterWorkspaceEntryProps): ReactNode => {
  const commandCenterResolvedPageProps = useTrainingCommandCenterPageController({
    isActive: normalizedActivePage === "COMMAND_CENTER",
    language,
    ui,
    onStatsError,
    onSelectPage,
    canResumeTrainerSession,
    onResumeTrainerSession,
    onNavigateToSpecialTrainingMode: navigateToSpecialTrainingMode,
    trainerBridge: {
      freeReplaySetup: {
        samplePoolOptions:
          trainerWorkspacePageProps.freeReplaySetup.samplePoolOptions,
        selectedPoolDataTraits:
          trainerWorkspacePageProps.freeReplaySetup.selectedPoolDataTraits,
        selectedSymbol: trainerWorkspacePageProps.freeReplaySetup.selectedSymbol,
        selectedSamplePoolId:
          trainerWorkspacePageProps.freeReplaySetup.selectedSamplePoolId,
        selectedMinimumBaseTimeframe:
          trainerWorkspacePageProps.freeReplaySetup
            .selectedMinimumBaseTimeframe,
        selectedMode: trainerWorkspacePageProps.freeReplaySetup.selectedMode,
        isPrepMode: trainerWorkspacePageProps.freeReplaySetup.isPrepMode,
        startDisabled: trainerWorkspacePageProps.freeReplaySetup.startDisabled,
        onStart: trainerWorkspacePageProps.freeReplaySetup.onStart,
        onResetToPrepView:
          trainerWorkspacePageProps.freeReplaySetup.onResetToPrepView,
      },
    },
    notesBridge: {
      formatReplayNoteTime: notesPageProps.formatReplayNoteTime,
      onSelectReplayNoteId: notesPageProps.onSelectReplayNoteId,
    },
  });
  const defaultPageFallback = renderWorkspaceContinuitySkeleton(
    "COMMAND_CENTER",
    tt("appText.loading3"),
  );
  return (
    <Suspense fallback={defaultPageFallback}>
      <MemoTrainingCommandCenterPage {...commandCenterResolvedPageProps} />
    </Suspense>
  );
};

type WorkspacePageSwitcherProps = {
  activePage: WorkspacePage;
  onSelectPage: (page: WorkspacePage) => void;
  canResumeTrainerSession: boolean;
  onResumeTrainerSession: () => void;
  tt: (key: AppTextKey) => string;
  ui: UiLabelEntry;
  language: AppUiLanguage;
  priceColorMode: PriceColorMode;
  trainerWorkspacePageProps: TrainerWorkspacePageProps;
  historyWorkspacePageProps: HistoryWorkspacePageProps;
  sharedTrainerChartWorkspaceProps: Omit<TrainerChartWorkspaceProps, "topBar">;
  enabledSamplePoolSymbols: string[];
  enabledSamplePools: Array<{
    id: string;
    name: string;
    assetClass: "STOCK" | "FUTURES" | "FOREX" | "CRYPTO";
    assetClassLabel: string;
    marketPresetId: string;
    baseTimeframe: "1m" | "5m" | "1h" | "1d";
    symbols: string[];
    instruments: Array<{
      instrumentId: string;
      symbol: string;
      barCount?: number;
      timeStartTs?: string | null;
      timeEndTs?: string | null;
    }>;
    questionBankRevisionToken: string;
  }>;
  globalResetRevision: number;
  onSpecialTrainingChartSync: SpecialTrainingChartSyncHandler;
  onSpecialTrainingShortcutBindingsChange: (
    payload: SpecialTrainingShortcutBindings | null,
  ) => void;
  onCreateSpecialTrainingChallengeReviewNote: (
    payload: SpecialTrainingChallengeReviewNoteRequest,
  ) => void;
  resolveSamplePoolDisplayName: (
    samplePoolId: string,
    fallbackName?: string,
  ) => string;
  onStatsError: (message: string) => void;
  notesPageProps: NotesPageProps;
  dataConfigPageProps: DataConfigWorkspacePageProps;
  systemSettingsPageProps: SystemSettingsWorkspacePageProps;
  onboardingTargetId?: DesktopOnboardingTargetId | null;
  onDisplayedPageChange?: (page: WorkspacePage) => void;
};

export const WorkspacePageSwitcher = ({
  activePage,
  onSelectPage,
  canResumeTrainerSession,
  onResumeTrainerSession,
  tt,
  ui,
  language,
  priceColorMode,
  trainerWorkspacePageProps,
  historyWorkspacePageProps,
  sharedTrainerChartWorkspaceProps,
  enabledSamplePoolSymbols,
  enabledSamplePools,
  globalResetRevision,
  onSpecialTrainingChartSync,
  onSpecialTrainingShortcutBindingsChange,
  onCreateSpecialTrainingChallengeReviewNote,
  resolveSamplePoolDisplayName,
  onStatsError,
  notesPageProps,
  dataConfigPageProps,
  systemSettingsPageProps,
  onboardingTargetId = null,
  onDisplayedPageChange,
}: WorkspacePageSwitcherProps): ReactNode => {
  const normalizedActivePage = normalizeWorkspacePageForCache(activePage);
  const [displayedPage, setDisplayedPage] =
    useState<CachedWorkspacePage>(normalizedActivePage);
  const previousDisplayedPageRef =
    useRef<CachedWorkspacePage>(normalizedActivePage);
  const navigationMotionEpochRef = useRef(0);
  const [navigationMotion, setNavigationMotion] =
    useState<WorkspacePageNavigationMotion | null>(null);
  const [cachedPages, setCachedPages] = useState<CachedWorkspacePage[]>(() =>
    WORKSPACE_KEEP_ALIVE_PAGES.has(normalizedActivePage)
      ? [normalizedActivePage]
      : [],
  );
  const [idlePreloadedPages, setIdlePreloadedPages] = useState<
    CachedWorkspacePage[]
  >([]);
  const [pageLoadRetryEpoch, setPageLoadRetryEpoch] = useState(0);
  const retryWorkspacePageLoad = useCallback(() => {
    setPageLoadRetryEpoch((current) => current + 1);
  }, []);
  const hasCompletedInitialPageMountRef = useRef(false);
  const {
    diagnosticHistoryDeps,
    navigateToSpecialTrainingMode,
    specialTrainingEntryProps,
    challengeStatsEntryProps,
  } = useWorkspacePageEntryModels({
    onSelectPage,
    tt,
    ui,
    language,
    historyWorkspacePageProps,
    sharedTrainerChartWorkspaceProps,
    enabledSamplePoolSymbols,
    enabledSamplePools,
    globalResetRevision,
    onSpecialTrainingChartSync,
    onSpecialTrainingShortcutBindingsChange,
    onCreateSpecialTrainingChallengeReviewNote,
    resolveSamplePoolDisplayName,
    onStatsError,
  });
  useEffect(() => {
    if (!WORKSPACE_KEEP_ALIVE_PAGES.has(normalizedActivePage)) {
      return;
    }
    setCachedPages((current) => {
      const next = current.includes(normalizedActivePage)
        ? current
        : [...current, normalizedActivePage];
      return areCachedPagesEqual(current, next) ? current : next;
    });
  }, [normalizedActivePage]);

  const cachedPageSet = useMemo(() => new Set(cachedPages), [cachedPages]);
  const renderedPages = useMemo(() => {
    const pageSet = new Set(cachedPageSet);
    pageSet.add(normalizedActivePage);
    pageSet.add(displayedPage);
    return WORKSPACE_PAGE_RENDER_ORDER.filter((page) => pageSet.has(page));
  }, [cachedPageSet, displayedPage, normalizedActivePage]);
  const nextIdlePreloadPage = useMemo(
    () =>
      WORKSPACE_PAGE_IDLE_PRELOAD_ORDER.find(
        (page) =>
          page !== normalizedActivePage && !idlePreloadedPages.includes(page),
      ) ?? null,
    [idlePreloadedPages, normalizedActivePage],
  );

  useLayoutEffect(() => {
    if (normalizedActivePage === displayedPage) {
      return;
    }
    const requestPage = normalizedActivePage;
    // Commit the target shell before its heavy assets finish loading. The page-level
    // Suspense fallback keeps the frame stable while CSS and JS warm in parallel,
    // instead of leaving the previous page visible for an unbounded chunk wait.
    void preloadWorkspacePageAssets(requestPage).catch(() => undefined);
    setDisplayedPage(requestPage);
  }, [displayedPage, normalizedActivePage]);

  useLayoutEffect(() => {
    const fromPage = previousDisplayedPageRef.current;
    if (fromPage === displayedPage) {
      return;
    }
    previousDisplayedPageRef.current = displayedPage;
    const direction = getWorkspaceMotionDirection(fromPage, displayedPage);
    if (!hasCompletedInitialPageMountRef.current || direction === "none") {
      setNavigationMotion(null);
      return;
    }
    navigationMotionEpochRef.current += 1;
    setNavigationMotion({
      direction,
      epoch: navigationMotionEpochRef.current,
      page: displayedPage,
      surface: getWorkspaceMotionSurface(displayedPage),
    });
  }, [displayedPage]);

  const handlePageMotionEnd = useCallback(
    (event: AnimationEvent<HTMLDivElement>) => {
      const animationTarget = event.target as HTMLElement;
      if (
        event.currentTarget !== animationTarget &&
        !animationTarget.classList.contains("workspace-page-cache-slot-content")
      ) {
        return;
      }
      const completedEpoch = Number(event.currentTarget.dataset.motionEpoch);
      if (!Number.isFinite(completedEpoch)) {
        return;
      }
      setNavigationMotion((current) =>
        current?.epoch === completedEpoch ? null : current,
      );
    },
    [],
  );

  useEffect(() => {
    if (!navigationMotion || typeof window === "undefined") {
      return;
    }
    const motionEpoch = navigationMotion.epoch;
    const timerId = window.setTimeout(() => {
      setNavigationMotion((current) =>
        current?.epoch === motionEpoch ? null : current,
      );
    }, WORKSPACE_PAGE_NAVIGATION_MOTION_FAILSAFE_MS);
    return () => {
      window.clearTimeout(timerId);
    };
  }, [navigationMotion]);

  useEffect(() => {
    if (!nextIdlePreloadPage || typeof window === "undefined") {
      return;
    }
    const runtimeWindow = window as Window & {
      requestIdleCallback?: (
        callback: IdleRequestCallback,
        options?: IdleRequestOptions,
      ) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    let idleId: number | null = null;
    const preloadNextPage = () => {
      void preloadWorkspacePageAssets(nextIdlePreloadPage)
        .then(() => {
          setIdlePreloadedPages((current) =>
            current.includes(nextIdlePreloadPage)
              ? current
              : [...current, nextIdlePreloadPage],
          );
        })
        .catch(() => undefined);
    };
    const timerId = window.setTimeout(() => {
      if (typeof runtimeWindow.requestIdleCallback === "function") {
        idleId = runtimeWindow.requestIdleCallback(() => {
          preloadNextPage();
        }, { timeout: 5_000 });
        return;
      }
      preloadNextPage();
    }, 2_500);
    return () => {
      window.clearTimeout(timerId);
      if (
        idleId !== null &&
        typeof runtimeWindow.cancelIdleCallback === "function"
      ) {
        runtimeWindow.cancelIdleCallback(idleId);
      }
    };
  }, [nextIdlePreloadPage]);

  useEffect(() => {
    hasCompletedInitialPageMountRef.current = true;
  }, []);

  useLayoutEffect(() => {
    onDisplayedPageChange?.(displayedPage);
  }, [displayedPage, onDisplayedPageChange]);

  const renderPageFallback = (
    page: CachedWorkspacePage,
    label = tt("appText.loading3"),
  ) => renderWorkspaceContinuitySkeleton(page, label);
  const loadFailedLabel = tt("common.status.loadFailed");
  const retryLabel = tt("appText.retry");

  const renderWorkspacePage = (page: CachedWorkspacePage): ReactNode => {
    if (page === "COMMAND_CENTER") {
      return (
        <CommandCenterWorkspaceEntry
          normalizedActivePage={normalizedActivePage}
          onSelectPage={onSelectPage}
          canResumeTrainerSession={canResumeTrainerSession}
          onResumeTrainerSession={onResumeTrainerSession}
          tt={tt}
          ui={ui}
          language={language}
          trainerWorkspacePageProps={trainerWorkspacePageProps}
          notesPageProps={notesPageProps}
          navigateToSpecialTrainingMode={navigateToSpecialTrainingMode}
          onStatsError={onStatsError}
        />
      );
    }

    if (page === "TRAINER") {
      const isPageActive = page === normalizedActivePage;
      return (
        <RetryableWorkspacePageSurface
          componentProps={{
            ...trainerWorkspacePageProps,
            isActive: isPageActive,
            onboardingTargetId,
          }}
          fallback={renderPageFallback(page)}
          loadFailedLabel={loadFailedLabel}
          loader={WORKSPACE_PAGE_MODULE_LOADERS.TRAINER}
          moduleName="WORKSPACE_TRAINER"
          retryLabel={retryLabel}
        />
      );
    }

    if (page === "SPECIAL_TRAINING") {
      const isPageActive = page === normalizedActivePage;
      return (
        <RetryableWorkspacePageSurface
          componentProps={{
            ...specialTrainingEntryProps,
            onboardingTargetId,
            isPageActive,
          }}
          fallback={renderPageFallback(page)}
          loadFailedLabel={loadFailedLabel}
          loader={WORKSPACE_PAGE_MODULE_LOADERS.SPECIAL_TRAINING}
          moduleName="WORKSPACE_SPECIAL_TRAINING"
          retryLabel={retryLabel}
        />
      );
    }

    if (page === "HISTORY") {
      const isPageActive = page === normalizedActivePage;
      return (
        <RetryableWorkspacePageSurface
          componentProps={{
            history: diagnosticHistoryDeps,
            ui,
            language,
            isActive: isPageActive,
            onError: onStatsError,
          }}
          fallback={renderPageFallback(page)}
          loadFailedLabel={loadFailedLabel}
          loader={WORKSPACE_PAGE_MODULE_LOADERS.HISTORY}
          moduleName="WORKSPACE_HISTORY"
          retryLabel={retryLabel}
        />
      );
    }

    if (page === "CHALLENGE_STATS") {
      const isPageActive = page === normalizedActivePage;
      return (
        <RetryableWorkspacePageSurface
          componentProps={{
            ...challengeStatsEntryProps,
            isActive: isPageActive,
          }}
          fallback={renderPageFallback(page, ui.statsLoading)}
          loadFailedLabel={loadFailedLabel}
          loader={WORKSPACE_PAGE_MODULE_LOADERS.CHALLENGE_STATS}
          moduleName="WORKSPACE_CHALLENGE_STATS"
          retryLabel={retryLabel}
        />
      );
    }

    if (page === "STRATEGY_BACKTEST") {
      const isPageActive = page === normalizedActivePage;
      return (
        <RetryableWorkspacePageSurface
          componentProps={{
            isActive: isPageActive,
            enabledSamplePools: enabledSamplePools as StrategyBacktestSamplePool[],
            tradingPresetEditor: trainerWorkspacePageProps.tradingPresetEditor,
            trainerDisplayPeriod:
              historyWorkspacePageProps.trainerDisplayPeriod,
            trainerPeriodOptionsByBase:
              historyWorkspacePageProps.trainerPeriodOptionsByBase,
            chartRenderMode: historyWorkspacePageProps.chartRenderMode,
          }}
          fallback={renderPageFallback(page)}
          loadFailedLabel={loadFailedLabel}
          loader={WORKSPACE_PAGE_MODULE_LOADERS.STRATEGY_BACKTEST}
          moduleName="WORKSPACE_STRATEGY_BACKTEST"
          retryLabel={retryLabel}
        />
      );
    }

    if (page === "NOTES") {
      const isPageActive = page === normalizedActivePage;
      return (
        <RetryableWorkspacePageSurface
          componentProps={{ ...notesPageProps, isActive: isPageActive }}
          fallback={renderPageFallback(page, tt("appText.loading3"))}
          loadFailedLabel={loadFailedLabel}
          loader={WORKSPACE_PAGE_MODULE_LOADERS.NOTES}
          moduleName="WORKSPACE_NOTES"
          retryLabel={retryLabel}
        />
      );
    }

    if (page === "CUSTOM_INDICATOR") {
      const isPageActive = page === normalizedActivePage;
      return (
        <RetryableWorkspacePageSurface
          componentProps={{
            language,
            ui,
            isActive: isPageActive,
            priceColorMode,
            resolveSamplePoolDisplayName,
          }}
          fallback={renderPageFallback(page)}
          loadFailedLabel={loadFailedLabel}
          loader={WORKSPACE_PAGE_MODULE_LOADERS.CUSTOM_INDICATOR}
          moduleName="WORKSPACE_CUSTOM_INDICATOR"
          retryLabel={retryLabel}
        />
      );
    }

    if (page === "DATA") {
      const isPageActive = page === normalizedActivePage;
      return (
        <RetryableWorkspacePageSurface
          componentProps={{ ...dataConfigPageProps, isActive: isPageActive }}
          fallback={renderPageFallback(page)}
          loadFailedLabel={loadFailedLabel}
          loader={WORKSPACE_PAGE_MODULE_LOADERS.DATA}
          moduleName="WORKSPACE_DATA"
          retryLabel={retryLabel}
        />
      );
    }

    const isPageActive = page === normalizedActivePage;
    return (
      <RetryableWorkspacePageSurface
        componentProps={{ ...systemSettingsPageProps, isActive: isPageActive }}
        fallback={renderPageFallback(page)}
        loadFailedLabel={loadFailedLabel}
        loader={WORKSPACE_PAGE_MODULE_LOADERS.SETTINGS}
        moduleName="WORKSPACE_SETTINGS"
        retryLabel={retryLabel}
      />
    );
  };

  return renderedPages.map((page) => {
    const isActive = page === normalizedActivePage;
    const isDisplayed = page === displayedPage;
    const isPreparing = isActive && !isDisplayed;
    const isExiting = isDisplayed && normalizedActivePage !== displayedPage;
    const pageNavigationMotion =
      isDisplayed && navigationMotion?.page === page ? navigationMotion : null;
    return (
      <div
        key={page}
        className={`workspace-page-cache-slot ${
          isActive ? "is-active" : "is-cached"
        } ${isDisplayed ? "is-visible" : "is-hidden-ready"} ${
          isPreparing ? "is-preparing" : ""
        } ${isExiting ? "is-exiting" : ""}`.trim()}
        aria-hidden={isDisplayed ? undefined : true}
        inert={isDisplayed ? undefined : true}
        data-active-page={isActive ? "true" : undefined}
        data-displayed-page={isDisplayed ? "true" : undefined}
        data-page-state={
          isDisplayed ? (isExiting ? "exiting" : "visible") : isPreparing ? "preparing" : "hidden-ready"
        }
        data-motion-direction={pageNavigationMotion?.direction}
        data-motion-enabled={pageNavigationMotion ? "true" : undefined}
        data-motion-epoch={
          pageNavigationMotion ? String(pageNavigationMotion.epoch) : undefined
        }
        data-motion-surface={pageNavigationMotion?.surface}
        onAnimationEnd={
          pageNavigationMotion ? handlePageMotionEnd : undefined
        }
      >
        <div className="workspace-page-cache-slot-content">
          {page === "COMMAND_CENTER" ? (
            <WorkspacePageLoadBoundary
              page={page}
              resetKey={`${page}:${normalizedActivePage}:${pageLoadRetryEpoch}`}
              loadFailedLabel={loadFailedLabel}
              onRetry={retryWorkspacePageLoad}
              retryLabel={retryLabel}
            >
              {renderWorkspacePage(page)}
            </WorkspacePageLoadBoundary>
          ) : (
            renderWorkspacePage(page)
          )}
        </div>
      </div>
    );
  });
};

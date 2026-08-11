// SPDX-License-Identifier: GPL-3.0-only

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import ReactDOM from "react-dom/client";
import { ensureLocaleCatalog } from "@zinuto/shared/i18n";
import { GRAPHIC_IMAGE_ASSET_URLS } from "../src/assets/graphics";
import { resetFreeReplayDraftLifecycle } from "../src/domains/trainer/freeReplayDraftLifecycle";
import { I18nProvider } from "../src/frontend-kernel/i18n";
import { WORKSPACE_KEEP_ALIVE_PAGES } from "../src/frontend-kernel/workspacePageModel";
import {
  resolveTypographyScriptGroup,
  setGlobalTypographyContext,
} from "../src/frontend-kernel/typography";
import { AppShell, SidebarNav } from "../src/ui/components";
import type { SidebarNavGroup } from "../src/ui/components/sidebarNavTypes";
import { getUiLabels } from "../src/ui/config/uiLabels";
import { buildGlobalVisualCssVariables } from "../src/ui/theme/visualColors";
import { TrainingCommandCenterPage } from "../src/workspaces/command-center/TrainingCommandCenterPage";
import { useTrainingCommandCenterPageController } from "../src/workspaces/command-center/useTrainingCommandCenterPageController";
import "../src/styles/index.css";

type WorkspacePage =
  | "COMMAND_CENTER"
  | "TRAINER"
  | "HISTORY"
  | "SPECIAL_TRAINING"
  | "CHALLENGE_STATS"
  | "STRATEGY_BACKTEST"
  | "NOTES"
  | "CUSTOM_INDICATOR"
  | "DATA"
  | "SETTINGS";

type WorkspaceAssetStatus = "idle" | "loading" | "ready";

type FreeReplayBridgeState = {
  samplePoolOptions: Array<{ value: string; label: string }>;
  selectedPoolDataTraits: Array<{
    id: "assetClass" | "marketPreset" | "sourceTimeframe";
    label: string;
    value: string;
  }>;
  selectedSymbol: string;
  selectedSamplePoolId: string;
  selectedMinimumBaseTimeframe: string;
  selectedMode: "FOCUSED" | "RANDOM";
  isPrepMode: boolean;
  startDisabled: boolean;
};

type ContinuitySnapshot = {
  activeNavKey: string | null;
  activePage: WorkspacePage;
  displayedPage: WorkspacePage;
  hasBlankFrame: boolean;
  loaderVisible: boolean;
  maxVisibleIconSize: number;
  motionActive: boolean;
  motionEpoch: string | null;
  visibleHiddenReadyPages: string[];
  visiblePages: string[];
  visibleText: string;
};

declare global {
  interface Window {
    __ZINUTO_WORKSPACE_NAV_CONTINUITY__?: {
      snapshot: () => ContinuitySnapshot;
    };
  }
}

const WORKSPACE_PAGES: WorkspacePage[] = [
  "COMMAND_CENTER",
  "TRAINER",
  "HISTORY",
  "SPECIAL_TRAINING",
  "CHALLENGE_STATS",
  "STRATEGY_BACKTEST",
  "NOTES",
  "CUSTOM_INDICATOR",
  "DATA",
  "SETTINGS",
];

const ASSET_READY_DELAY_MS = 220;
const WORKSPACE_PAGE_NAVIGATION_MOTION_FAILSAFE_MS = 600;

type WorkspaceMotionDirection = "backward" | "forward" | "none";
type WorkspaceMotionSurface = "immersive" | "standard";
type WorkspaceNavigationMotion = {
  direction: Exclude<WorkspaceMotionDirection, "none">;
  epoch: number;
  page: WorkspacePage;
  surface: WorkspaceMotionSurface;
};

const PAGE_META: Record<
  WorkspacePage,
  {
    accent: string;
    body: string;
    icon: SidebarNavGroup["items"][number]["icon"];
    label: string;
  }
> = {
  COMMAND_CENTER: {
    accent: "#2f7dd7",
    body: "Command center content remains visible while the next workspace warms.",
    icon: "navCommandCenter",
    label: "Command Center",
  },
  TRAINER: {
    accent: "#18a77d",
    body: "Trainer chart and action rail keep a stable frame during navigation.",
    icon: "navTrainer",
    label: "Trainer",
  },
  HISTORY: {
    accent: "#9d6bdc",
    body: "History review panels stay mounted after the first visit.",
    icon: "navHistory",
    label: "History",
  },
  SPECIAL_TRAINING: {
    accent: "#d98a24",
    body: "Special training prepares in a hidden slot before display.",
    icon: "navChallengeHall",
    label: "Special Training",
  },
  CHALLENGE_STATS: {
    accent: "#c84f6b",
    body: "Challenge stats wait for assets without exposing a blank main area.",
    icon: "navStats",
    label: "Challenge Stats",
  },
  STRATEGY_BACKTEST: {
    accent: "#3f8d76",
    body: "Backtest inputs and result selection remain mounted while jobs continue.",
    icon: "navStrategyBacktest",
    label: "Strategy Backtest",
  },
  NOTES: {
    accent: "#4d94a8",
    body: "Notes editor state is retained for the current app session.",
    icon: "navNotes",
    label: "Notes",
  },
  CUSTOM_INDICATOR: {
    accent: "#7b7ec8",
    body: "Custom indicator editor measurements are inactive while hidden.",
    icon: "navCustomIndicator",
    label: "Custom Indicator",
  },
  DATA: {
    accent: "#b47d28",
    body: "Data management warms its CSS and JS before replacing content.",
    icon: "navData",
    label: "Data",
  },
  SETTINGS: {
    accent: "#62717d",
    body: "Settings enters from a ready slot with no centered loader flash.",
    icon: "settingsGear",
    label: "Settings",
  },
};

const continuityStyle = `
.workspace-navigation-continuity-root {
  width: 100vw;
  height: 100vh;
  min-height: 100vh;
  overflow: hidden;
  background: var(--window-bg);
}

.workspace-navigation-continuity-root .desktop-shell {
  width: 100%;
  height: 100%;
  border-radius: 0;
  border: 0;
}

.workspace-continuity-page {
  min-height: 100%;
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 24px;
  padding: clamp(28px, 4vw, 56px);
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--page-accent) 18%, transparent), transparent 38%),
    var(--panel);
  color: var(--text-strong);
}

.workspace-continuity-page-header {
  display: grid;
  gap: 10px;
}

.workspace-continuity-icon {
  width: 48px;
  height: 48px;
  display: inline-grid;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--page-accent) 42%, var(--line));
  background: color-mix(in srgb, var(--page-accent) 16%, transparent);
  color: var(--page-accent);
}

.workspace-continuity-icon svg {
  width: 28px;
  height: 28px;
  fill: currentColor;
}

.workspace-continuity-eyebrow {
  color: color-mix(in srgb, var(--page-accent) 76%, var(--text-subtle));
  font-size: var(--ty-r2);
  font-weight: 760;
  line-height: 1.2;
  text-transform: uppercase;
}

.workspace-continuity-title {
  margin: 0;
  font-size: var(--ty-r6);
  font-weight: 760;
  line-height: 1.05;
}

.workspace-continuity-body {
  max-width: 760px;
  color: var(--text-secondary);
  font-size: var(--ty-r4);
  line-height: 1.5;
}

.workspace-continuity-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  align-content: start;
}

.workspace-continuity-tile {
  min-height: 124px;
  border: 1px solid color-mix(in srgb, var(--line) 74%, transparent);
  background: color-mix(in srgb, var(--panel-soft) 82%, transparent);
  display: grid;
  align-content: end;
  padding: 18px;
}

@media (max-width: 920px) {
  .workspace-continuity-grid {
    grid-template-columns: 1fr;
  }
}
`;

const buildMainClassName = (page: WorkspacePage): string =>
  `${page === "TRAINER" ? "is-trainer" : "is-single-page"} ${
    page === "SPECIAL_TRAINING" ? "is-special-training" : ""
  }`;

const getWorkspaceMotionDirection = (
  fromPage: WorkspacePage | null,
  toPage: WorkspacePage,
): WorkspaceMotionDirection => {
  if (!fromPage || fromPage === toPage) {
    return "none";
  }
  const fromIndex = WORKSPACE_PAGES.indexOf(fromPage);
  const toIndex = WORKSPACE_PAGES.indexOf(toPage);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
    return "none";
  }
  return fromIndex < toIndex ? "forward" : "backward";
};

const getWorkspaceMotionSurface = (page: WorkspacePage): WorkspaceMotionSurface =>
  page === "TRAINER" || page === "SPECIAL_TRAINING" ? "immersive" : "standard";

const isElementVisible = (element: HTMLElement): boolean => {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return (
    rect.width > 1 &&
    rect.height > 1 &&
    style.visibility !== "hidden" &&
    style.display !== "none" &&
    Number(style.opacity || "1") > 0.01
  );
};

const collectSnapshot = (
  activePage: WorkspacePage,
  displayedPage: WorkspacePage,
): ContinuitySnapshot => {
  const visibleSlots = Array.from(
    document.querySelectorAll<HTMLElement>(
      ".workspace-page-cache-slot.is-visible",
    ),
  ).filter(isElementVisible);
  const visibleHiddenReadyPages = Array.from(
    document.querySelectorAll<HTMLElement>(
      ".workspace-page-cache-slot.is-hidden-ready",
    ),
  )
    .filter(isElementVisible)
    .map((slot) => slot.dataset.workspacePage ?? "UNKNOWN");
  const visibleText = visibleSlots
    .map((slot) => slot.textContent?.trim() ?? "")
    .join(" ")
    .trim();
  const maxVisibleIconSize = Math.max(
    0,
    ...Array.from(
      document.querySelectorAll<SVGElement | HTMLImageElement>(
        ".workspace-page-cache-slot svg, .workspace-page-cache-slot img",
      ),
    )
      .filter((element) => isElementVisible(element as unknown as HTMLElement))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return Math.max(rect.width, rect.height);
      }),
  );
  const motionSlot = document.querySelector<HTMLElement>(
    ".workspace-page-cache-slot[data-motion-enabled='true']",
  );
  const activeNavKey =
    document
      .querySelector<HTMLElement>(".sidebar-nav-item[data-active='true']")
      ?.dataset.navItemKey ?? null;
  return {
    activeNavKey,
    activePage,
    displayedPage,
    hasBlankFrame: visibleSlots.length === 0 || visibleText.length === 0,
    loaderVisible: Boolean(
      document.querySelector(
        ".workspace-page-loading-shell, .page-loading-state",
      ),
    ),
    maxVisibleIconSize,
    motionActive: Boolean(motionSlot),
    motionEpoch: motionSlot?.dataset.motionEpoch ?? null,
    visibleHiddenReadyPages,
    visiblePages: visibleSlots.map(
      (slot) => slot.dataset.workspacePage ?? "UNKNOWN",
    ),
    visibleText,
  };
};

let workspacePageMountSequence = 0;

const WorkspaceContinuityPage = ({
  page,
}: {
  page: WorkspacePage;
}) => {
  const meta = PAGE_META[page];
  const [draft, setDraft] = useState("");
  const mountTokenRef = useRef(`${page}-${++workspacePageMountSequence}`);
  return (
    <section
      className="workspace-continuity-page"
      data-testid={`workspace-continuity-page-${page}`}
      style={{ "--page-accent": meta.accent } as CSSProperties}
    >
      <header className="workspace-continuity-page-header">
        <span className="workspace-continuity-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" role="img">
            <path d="M12 3.2 20.2 8v8L12 20.8 3.8 16V8L12 3.2Z" />
            <path d="M12 7.8 16.4 10.4v4.2L12 17.2l-4.4-2.6v-4.2L12 7.8Z" />
          </svg>
        </span>
        <div className="workspace-continuity-eyebrow">Workspace</div>
        <h1 className="workspace-continuity-title">{meta.label}</h1>
        <p className="workspace-continuity-body">{meta.body}</p>
      </header>
      <div className="workspace-continuity-grid" aria-hidden="true">
        <div className="workspace-continuity-tile">Asset status ready</div>
        <div className="workspace-continuity-tile">Cached slot retained</div>
        <div className="workspace-continuity-tile">No blank main frame</div>
      </div>
      <label>
        Retained state
        <input
          data-testid={`workspace-state-${page}`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      </label>
      <output data-testid={`workspace-mount-${page}`}>
        {mountTokenRef.current}
      </output>
    </section>
  );
};

const WorkspaceContinuityBrand = () => (
  <strong className="sidebar-brand-name">Zinuto Core</strong>
);

const GLOBAL_FREE_REPLAY_ENVIRONMENT = {
  assetClass: "STOCK",
  marketPresetId: "A_SHARE",
};

const createResumedUsFreeReplayBridge = (): FreeReplayBridgeState => ({
  samplePoolOptions: [{ value: "system-us-stocks", label: "US Stocks" }],
  selectedPoolDataTraits: [
    { id: "assetClass", label: "Asset", value: "STOCK" },
    { id: "marketPreset", label: "Market", value: "US_STOCK" },
    { id: "sourceTimeframe", label: "Source", value: "1d" },
  ],
  selectedSymbol: "AAPL",
  selectedSamplePoolId: "system-us-stocks",
  selectedMinimumBaseTimeframe: "1d",
  selectedMode: "FOCUSED",
  isPrepMode: false,
  startDisabled: true,
});

const createAShareFreeReplayBridge = (
  marketPresetId: string,
): FreeReplayBridgeState => ({
  samplePoolOptions: [{ value: "system-a-shares", label: "A Shares" }],
  selectedPoolDataTraits: [
    { id: "assetClass", label: "Asset", value: "STOCK" },
    { id: "marketPreset", label: "Market", value: marketPresetId },
    { id: "sourceTimeframe", label: "Source", value: "1d" },
  ],
  selectedSymbol: "600000",
  selectedSamplePoolId: "system-a-shares",
  selectedMinimumBaseTimeframe: "1d",
  selectedMode: "FOCUSED",
  isPrepMode: true,
  startDisabled: false,
});

const readBridgeMarketPreset = (state: FreeReplayBridgeState): string =>
  state.selectedPoolDataTraits.find((trait) => trait.id === "marketPreset")
    ?.value ?? "";

const CommandCenterFreeReplayLifecycleHarness = () => {
  const [activePage, setActivePage] =
    useState<WorkspacePage>("COMMAND_CENTER");
  const [activeSessionId, setActiveSessionId] = useState("resumed-us-session");
  const [activeFormEnvironment, setActiveFormEnvironment] = useState({
    assetClass: "STOCK",
    marketPresetId: "US_STOCK",
  });
  const [freeReplaySetup, setFreeReplaySetup] =
    useState<FreeReplayBridgeState>(createResumedUsFreeReplayBridge);
  const ui = useMemo(() => getUiLabels("zh-CN"), []);
  const typography = useMemo(
    () =>
      setGlobalTypographyContext({
        language: "zh-CN",
        fontSizePreset: "STANDARD",
      }),
    [],
  );
  const rootStyle = useMemo(
    () =>
      ({
        ...typography.cssVariables,
        ...buildGlobalVisualCssVariables(
          "dark",
          "RED_UP_GREEN_DOWN",
          "INSTITUTIONAL",
        ),
      }) as CSSProperties,
    [typography.cssVariables],
  );

  const resetToPrepView = useCallback(() => {
    resetFreeReplayDraftLifecycle({
      globalEnvironment: GLOBAL_FREE_REPLAY_ENVIRONMENT,
      resetActiveTrainerSession: () => setActiveSessionId(""),
      invalidatePrepReadModel: () =>
        setFreeReplaySetup((current) => ({
          ...current,
          startDisabled: true,
        })),
      clearPrepSelection: () =>
        setFreeReplaySetup((current) => ({
          ...current,
          samplePoolOptions: [],
          selectedPoolDataTraits: [],
          selectedSamplePoolId: "",
          selectedSymbol: "",
        })),
      clearPrepAnchors: () => undefined,
      clearPrepInteractionState: () => undefined,
      restoreGlobalTradingSettingsForm: () =>
        setActiveFormEnvironment(GLOBAL_FREE_REPLAY_ENVIRONMENT),
      applyPrepEnvironment: (selection) =>
        setFreeReplaySetup(
          createAShareFreeReplayBridge(selection.marketPresetId),
        ),
    });
  }, []);

  const commandCenterPageProps = useTrainingCommandCenterPageController({
    isActive: false,
    canResumeTrainerSession: true,
    language: "zh-CN",
    ui,
    onSelectPage: (page) => {
      if (page === "TRAINER") {
        setActivePage("TRAINER");
      }
    },
    onResumeTrainerSession: () => undefined,
    onNavigateToSpecialTrainingMode: () => undefined,
    trainerBridge: {
      freeReplaySetup: {
        ...freeReplaySetup,
        onStart: () => undefined,
        onResetToPrepView: resetToPrepView,
      },
    },
    notesBridge: {
      formatReplayNoteTime: (value) => value,
      onSelectReplayNoteId: () => undefined,
    },
  });

  return (
    <I18nProvider locale="zh-CN">
      <style>{continuityStyle}</style>
      <div
        className="app-root theme-dark font-size-standard layout-standard workspace-navigation-continuity-root"
        data-testid="command-center-free-replay-lifecycle-root"
        lang="zh-CN"
        style={rootStyle}
      >
        <output data-testid="global-market">
          {GLOBAL_FREE_REPLAY_ENVIRONMENT.marketPresetId}
        </output>
        <output data-testid="active-session">{activeSessionId}</output>
        <output data-testid="active-form-market">
          {activeFormEnvironment.marketPresetId}
        </output>
        {activePage === "COMMAND_CENTER" ? (
          <TrainingCommandCenterPage {...commandCenterPageProps} />
        ) : (
          <section
            className="workspace-continuity-page"
            data-testid="free-replay-prep-page"
            style={{ "--page-accent": "#18a77d" } as CSSProperties}
          >
            <h1>Free Replay Prep</h1>
            <output data-testid="active-page">{activePage}</output>
            <output data-testid="prep-market">
              {readBridgeMarketPreset(freeReplaySetup)}
            </output>
            <output data-testid="prep-pool">
              {freeReplaySetup.selectedSamplePoolId}
            </output>
            <output data-testid="prep-instrument">
              {freeReplaySetup.selectedSymbol}
            </output>
            <button
              type="button"
              data-testid="trainer-start"
              disabled={freeReplaySetup.startDisabled}
            >
              Start
            </button>
          </section>
        )}
      </div>
    </I18nProvider>
  );
};

const WorkspaceNavigationContinuityHarness = () => {
  const [activePage, setActivePage] =
    useState<WorkspacePage>("COMMAND_CENTER");
  const [displayedPage, setDisplayedPage] =
    useState<WorkspacePage>("COMMAND_CENTER");
  const [cachedPages, setCachedPages] = useState<WorkspacePage[]>([]);
  const [navigationMotion, setNavigationMotion] =
    useState<WorkspaceNavigationMotion | null>(null);
  const [assetStatusByPage, setAssetStatusByPage] = useState<
    Record<WorkspacePage, WorkspaceAssetStatus>
  >(() =>
    Object.fromEntries(
      WORKSPACE_PAGES.map((page) => [
        page,
        page === "COMMAND_CENTER" ? "ready" : "idle",
      ]),
    ) as Record<WorkspacePage, WorkspaceAssetStatus>,
  );
  const hasCompletedInitialPageMountRef = useRef(false);
  const navigationMotionEpochRef = useRef(0);
  const pendingTimersRef = useRef(new Map<WorkspacePage, number>());
  const previousDisplayedPageRef =
    useRef<WorkspacePage>("COMMAND_CENTER");

  const warmPageAssets = useCallback(
    (page: WorkspacePage) => {
      if (assetStatusByPage[page] === "ready") {
        return;
      }
      if (pendingTimersRef.current.has(page)) {
        return;
      }
      setAssetStatusByPage((current) => ({ ...current, [page]: "loading" }));
      const timerId = window.setTimeout(() => {
        pendingTimersRef.current.delete(page);
        setAssetStatusByPage((current) => ({ ...current, [page]: "ready" }));
      }, ASSET_READY_DELAY_MS);
      pendingTimersRef.current.set(page, timerId);
    },
    [assetStatusByPage],
  );

  const navigateToPage = useCallback(
    (page: WorkspacePage) => {
      setActivePage(page);
      setDisplayedPage(page);
      setCachedPages((current) => {
        if (!WORKSPACE_KEEP_ALIVE_PAGES.has(page)) {
          return current;
        }
        return current.includes(page) ? current : [...current, page];
      });
      if (assetStatusByPage[page] !== "ready") {
        warmPageAssets(page);
      }
    },
    [assetStatusByPage, warmPageAssets],
  );

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

  useEffect(() => {
    hasCompletedInitialPageMountRef.current = true;
  }, []);

  useEffect(() => {
    if (!navigationMotion) {
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

  const handlePageMotionEnd = useCallback(
    (event: React.AnimationEvent<HTMLDivElement>) => {
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

  useEffect(
    () => () => {
      for (const timerId of pendingTimersRef.current.values()) {
        window.clearTimeout(timerId);
      }
      pendingTimersRef.current.clear();
    },
    [],
  );

  useEffect(() => {
    window.__ZINUTO_WORKSPACE_NAV_CONTINUITY__ = {
      snapshot: () => collectSnapshot(activePage, displayedPage),
    };
    return () => {
      delete window.__ZINUTO_WORKSPACE_NAV_CONTINUITY__;
    };
  }, [activePage, displayedPage, navigationMotion]);

  const typography = useMemo(
    () =>
      setGlobalTypographyContext({
        language: "zh-CN",
        fontSizePreset: "STANDARD",
      }),
    [],
  );
  const rootStyle = useMemo(
    () =>
      ({
        ...typography.cssVariables,
        ...buildGlobalVisualCssVariables(
          "dark",
          "RED_UP_GREEN_DOWN",
          "INSTITUTIONAL",
        ),
      }) as CSSProperties,
    [typography.cssVariables],
  );
  const sidebarGroups = useMemo<SidebarNavGroup[]>(
    () => [
      {
        key: "command",
        label: "Command",
        items: [
          {
            key: "COMMAND_CENTER",
            label: PAGE_META.COMMAND_CENTER.label,
            icon: PAGE_META.COMMAND_CENTER.icon,
            active: activePage === "COMMAND_CENTER",
            onClick: () => navigateToPage("COMMAND_CENTER"),
            onFocus: () => warmPageAssets("COMMAND_CENTER"),
            onPointerDown: () => warmPageAssets("COMMAND_CENTER"),
            onPointerEnter: () => warmPageAssets("COMMAND_CENTER"),
          },
        ],
      },
      {
        key: "training",
        label: "Training",
        items: ["TRAINER", "HISTORY", "SPECIAL_TRAINING", "CHALLENGE_STATS"].map(
          (page) => ({
            key: page,
            label: PAGE_META[page as WorkspacePage].label,
            icon: PAGE_META[page as WorkspacePage].icon,
            active: activePage === page,
            onClick: () => navigateToPage(page as WorkspacePage),
            onFocus: () => warmPageAssets(page as WorkspacePage),
            onPointerDown: () => warmPageAssets(page as WorkspacePage),
            onPointerEnter: () => warmPageAssets(page as WorkspacePage),
          }),
        ),
      },
      {
        key: "tools",
        label: "Tools",
        items: [
          "STRATEGY_BACKTEST",
          "NOTES",
          "CUSTOM_INDICATOR",
          "DATA",
          "SETTINGS",
        ].map((page) => ({
          key: page,
          label: PAGE_META[page as WorkspacePage].label,
          icon: PAGE_META[page as WorkspacePage].icon,
          active: activePage === page,
          onClick: () => navigateToPage(page as WorkspacePage),
          onFocus: () => warmPageAssets(page as WorkspacePage),
          onPointerDown: () => warmPageAssets(page as WorkspacePage),
          onPointerEnter: () => warmPageAssets(page as WorkspacePage),
        })),
      },
    ],
    [activePage, navigateToPage, warmPageAssets],
  );

  const renderedPages = useMemo(() => {
    const pageSet = new Set(cachedPages);
    pageSet.add(activePage);
    pageSet.add(displayedPage);
    return WORKSPACE_PAGES.filter((page) => pageSet.has(page));
  }, [activePage, cachedPages, displayedPage]);

  return (
    <I18nProvider locale="zh-CN">
      <style>{continuityStyle}</style>
      <div
        className="app-root theme-dark font-size-standard layout-standard workspace-navigation-continuity-root"
        data-locale-width-profile="compact"
        data-script-group={resolveTypographyScriptGroup("zh-CN")}
        data-testid="workspace-navigation-continuity-root"
        lang="zh-CN"
        style={rootStyle}
      >
        <AppShell
          className="is-sidebar-unified"
          mainClassName={buildMainClassName(displayedPage)}
          sidebar={
            <SidebarNav
              brandName="Zinuto"
              brandLogo={GRAPHIC_IMAGE_ASSET_URLS.brandLogoRounded}
              brandLogoAlt="Zinuto"
              groups={sidebarGroups}
              brandNode={<WorkspaceContinuityBrand />}
            />
          }
        >
          {renderedPages.map((page) => {
            const isActive = page === activePage;
            const isDisplayed = page === displayedPage;
            const isPreparing = isActive && !isDisplayed;
            const isExiting = isDisplayed && activePage !== displayedPage;
            const pageNavigationMotion =
              isDisplayed && navigationMotion?.page === page
                ? navigationMotion
                : null;
            const pageState = isDisplayed
              ? isExiting
                ? "exiting"
                : "visible"
              : isPreparing
                ? "preparing"
                : "hidden-ready";
            return (
              <div
                key={page}
                aria-hidden={isDisplayed ? undefined : true}
                inert={isDisplayed ? undefined : true}
                className={`workspace-page-cache-slot ${
                  isActive ? "is-active" : "is-cached"
                } ${isDisplayed ? "is-visible" : "is-hidden-ready"} ${
                  isPreparing ? "is-preparing" : ""
                } ${isExiting ? "is-exiting" : ""}`.trim()}
                data-active-page={isActive ? "true" : undefined}
                data-asset-status={assetStatusByPage[page]}
                data-displayed-page={isDisplayed ? "true" : undefined}
                data-motion-direction={pageNavigationMotion?.direction}
                data-motion-enabled={pageNavigationMotion ? "true" : undefined}
                data-motion-epoch={
                  pageNavigationMotion
                    ? String(pageNavigationMotion.epoch)
                    : undefined
                }
                data-motion-surface={pageNavigationMotion?.surface}
                data-page-state={pageState}
                data-workspace-page={page}
                onAnimationEnd={
                  pageNavigationMotion ? handlePageMotionEnd : undefined
                }
              >
                <div className="workspace-page-cache-slot-content">
                  <WorkspaceContinuityPage page={page} />
                </div>
              </div>
            );
          })}
        </AppShell>
      </div>
    </I18nProvider>
  );
};

await ensureLocaleCatalog("zh-CN");
const testScenario = new URLSearchParams(window.location.search).get("scenario");
ReactDOM.createRoot(document.getElementById("root")!).render(
  testScenario === "command-center-free-replay" ? (
    <CommandCenterFreeReplayLifecycleHarness />
  ) : (
    <WorkspaceNavigationContinuityHarness />
  ),
);

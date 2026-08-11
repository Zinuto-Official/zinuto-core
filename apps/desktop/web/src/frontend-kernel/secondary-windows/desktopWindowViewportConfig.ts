// SPDX-License-Identifier: GPL-3.0-only

export type DesktopWindowZoomBase = {
  designWidth: number;
  designHeight: number;
  densityScale?: number;
  minScale?: number;
  maxScale?: number;
};

export type DesktopSecondaryWindowKind =
  | "ONBOARDING_TOUR"
  | "TRAINER_TRADING_ENVIRONMENT"
  | "STRATEGY_BACKTEST_RESULT_DETAIL"
  | "TRAINER_TRADING_DEFAULTS"
  | "TRAINER_START_POINT"
  | "TRAINER_INDICATOR_SETTINGS"
  | "SYSTEM_GLOBAL_RESET_CONFIRM"
  | "SPECIAL_TRAINING_BANK_EDITOR"
  | "SPECIAL_TRAINING_BANK_DELETE_CONFIRM"
  | "SPECIAL_TRAINING_MODE_RESTART_CONFIRM"
  | "FREE_REPLAY_REPLAY"
  | "FREE_REPLAY_ARCHIVE_DETAIL"
  | "FREE_REPLAY_SETTLEMENT_DETAIL"
  | "CHALLENGE_SESSION_REPLAY"
  | "CHALLENGE_STATS_REPLAY"
  | "REPLAY_NOTE_EDITOR"
  | "SAMPLE_POOL_IMPORT_CONFIG"
  | "MARKET_DATA_ACQUISITION"
  | "DATA_CONFIG_DETAIL"
  | "INDICATOR_REFERENCE";

export type DesktopSecondaryWindowGeometry = {
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
};

export type DesktopSecondaryWindowGeometryContext = {
  language?: string | null;
};

export type DesktopSecondaryWindowGeometryOptions = {
  payload?: unknown;
};

export type DesktopSecondaryWindowWorkAreaSize = {
  width: number;
  height: number;
};

/**
 * Native window coordinates and sizes are always physical pixels. Keeping this
 * separate from the logical geometry above prevents mixed-DPI desktops from
 * applying a monitor scale factor twice when a child window follows its owner.
 */
export type DesktopSecondaryWindowPhysicalFrame = {
  position: {
    x: number;
    y: number;
  };
  size: {
    width: number;
    height: number;
  };
};

export type DesktopSecondaryWindowPhysicalSize = {
  width: number;
  height: number;
};

export type DesktopSecondaryWindowZoomBase = Required<DesktopWindowZoomBase>;

export const DESKTOP_MAIN_WINDOW_DENSITY_SCALE = 0.9;

export const DESKTOP_MAIN_WINDOW_ZOOM_BASE = {
  designWidth: 1560,
  designHeight: 980,
  densityScale: DESKTOP_MAIN_WINDOW_DENSITY_SCALE,
  minScale: 0.56,
  maxScale: DESKTOP_MAIN_WINDOW_DENSITY_SCALE,
} as const satisfies DesktopSecondaryWindowZoomBase;

export const DESKTOP_SECONDARY_WINDOW_KINDS: ReadonlySet<DesktopSecondaryWindowKind> =
  new Set<DesktopSecondaryWindowKind>([
    "ONBOARDING_TOUR",
    "TRAINER_TRADING_ENVIRONMENT",
    "STRATEGY_BACKTEST_RESULT_DETAIL",
    "TRAINER_TRADING_DEFAULTS",
    "TRAINER_START_POINT",
    "TRAINER_INDICATOR_SETTINGS",
    "SYSTEM_GLOBAL_RESET_CONFIRM",
    "SPECIAL_TRAINING_BANK_EDITOR",
    "SPECIAL_TRAINING_BANK_DELETE_CONFIRM",
    "SPECIAL_TRAINING_MODE_RESTART_CONFIRM",
    "FREE_REPLAY_REPLAY",
    "FREE_REPLAY_ARCHIVE_DETAIL",
    "FREE_REPLAY_SETTLEMENT_DETAIL",
    "CHALLENGE_SESSION_REPLAY",
    "CHALLENGE_STATS_REPLAY",
    "REPLAY_NOTE_EDITOR",
    "SAMPLE_POOL_IMPORT_CONFIG",
    "MARKET_DATA_ACQUISITION",
    "DATA_CONFIG_DETAIL",
    "INDICATOR_REFERENCE",
  ]);

export const DESKTOP_SECONDARY_WINDOW_GEOMETRY = {
  ONBOARDING_TOUR: {
    width: 560,
    height: 720,
    minWidth: 460,
    minHeight: 560,
  },
  TRAINER_TRADING_ENVIRONMENT: {
    width: 1120,
    height: 760,
    minWidth: 860,
    minHeight: 620,
  },
  STRATEGY_BACKTEST_RESULT_DETAIL: {
    width: 1280,
    height: 860,
    minWidth: 1080,
    minHeight: 720,
  },
  TRAINER_TRADING_DEFAULTS: {
    width: 720,
    height: 560,
    minWidth: 620,
    minHeight: 480,
  },
  TRAINER_START_POINT: {
    width: 1180,
    height: 760,
    minWidth: 860,
    minHeight: 620,
  },
  TRAINER_INDICATOR_SETTINGS: {
    width: 780,
    height: 500,
    minWidth: 640,
    minHeight: 440,
  },
  SYSTEM_GLOBAL_RESET_CONFIRM: {
    width: 680,
    height: 460,
    minWidth: 560,
    minHeight: 380,
  },
  SPECIAL_TRAINING_BANK_EDITOR: {
    width: 1040,
    height: 780,
    minWidth: 760,
    minHeight: 620,
  },
  SPECIAL_TRAINING_BANK_DELETE_CONFIRM: {
    width: 640,
    height: 420,
    minWidth: 560,
    minHeight: 360,
  },
  SPECIAL_TRAINING_MODE_RESTART_CONFIRM: {
    width: 640,
    height: 420,
    minWidth: 560,
    minHeight: 360,
  },
  FREE_REPLAY_REPLAY: {
    width: 1200,
    height: 760,
    minWidth: 940,
    minHeight: 640,
  },
  FREE_REPLAY_ARCHIVE_DETAIL: {
    width: 980,
    height: 760,
    minWidth: 760,
    minHeight: 600,
  },
  FREE_REPLAY_SETTLEMENT_DETAIL: {
    width: 920,
    height: 720,
    minWidth: 720,
    minHeight: 600,
  },
  CHALLENGE_SESSION_REPLAY: {
    width: 1200,
    height: 760,
    minWidth: 940,
    minHeight: 640,
  },
  CHALLENGE_STATS_REPLAY: {
    width: 1200,
    height: 760,
    minWidth: 940,
    minHeight: 640,
  },
  REPLAY_NOTE_EDITOR: {
    width: 1220,
    height: 860,
    minWidth: 860,
    minHeight: 660,
  },
  SAMPLE_POOL_IMPORT_CONFIG: {
    width: 1180,
    height: 820,
    minWidth: 900,
    minHeight: 680,
  },
  MARKET_DATA_ACQUISITION: {
    width: 980,
    height: 780,
    minWidth: 760,
    minHeight: 620,
  },
  DATA_CONFIG_DETAIL: {
    width: 1180,
    height: 820,
    minWidth: 900,
    minHeight: 680,
  },
  INDICATOR_REFERENCE: {
    width: 1180,
    height: 820,
    minWidth: 860,
    minHeight: 640,
  },
} as const satisfies Record<
  DesktopSecondaryWindowKind,
  DesktopSecondaryWindowGeometry
>;

const TRAINER_INDICATOR_PARAMETER_GEOMETRY = {
  width: 620,
  height: 380,
  minWidth: 560,
  minHeight: 340,
} as const satisfies DesktopSecondaryWindowGeometry;

const TRAINER_INDICATOR_PARAMETER_TARGETS = new Set(["main", "top", "bottom"]);
export const DESKTOP_SECONDARY_WINDOW_WORK_AREA_MARGIN = 24;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const isTrainerIndicatorParameterPayload = (payload: unknown): boolean =>
  isRecord(payload) &&
  TRAINER_INDICATOR_PARAMETER_TARGETS.has(String(payload.focusedTarget ?? ""));

export const resolveDesktopSecondaryWindowGeometry = (
  kind: DesktopSecondaryWindowKind,
  _context?: DesktopSecondaryWindowGeometryContext | null,
  options?: DesktopSecondaryWindowGeometryOptions | null,
): DesktopSecondaryWindowGeometry => {
  const geometry = DESKTOP_SECONDARY_WINDOW_GEOMETRY[kind];
  if (
    kind === "TRAINER_INDICATOR_SETTINGS" &&
    isTrainerIndicatorParameterPayload(options?.payload)
  ) {
    return TRAINER_INDICATOR_PARAMETER_GEOMETRY;
  }
  return geometry;
};

const resolveAvailableWorkAreaDimension = (
  value: number,
  margin: number,
): number | null => {
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  const safeMargin = Number.isFinite(margin) && margin > 0 ? margin : 0;
  return Math.max(1, Math.floor(value - safeMargin * 2));
};

export const fitDesktopSecondaryWindowGeometryToWorkArea = (
  geometry: DesktopSecondaryWindowGeometry,
  workAreaSize: DesktopSecondaryWindowWorkAreaSize | null | undefined,
  margin = DESKTOP_SECONDARY_WINDOW_WORK_AREA_MARGIN,
): DesktopSecondaryWindowGeometry => {
  const availableWidth = resolveAvailableWorkAreaDimension(
    Number(workAreaSize?.width),
    margin,
  );
  const availableHeight = resolveAvailableWorkAreaDimension(
    Number(workAreaSize?.height),
    margin,
  );
  if (availableWidth === null && availableHeight === null) {
    return geometry;
  }

  const width =
    availableWidth === null
      ? geometry.width
      : Math.min(geometry.width, availableWidth);
  const height =
    availableHeight === null
      ? geometry.height
      : Math.min(geometry.height, availableHeight);

  return {
    width,
    height,
    minWidth: Math.min(geometry.minWidth, width),
    minHeight: Math.min(geometry.minHeight, height),
  };
};

const isFinitePhysicalDimension = (value: number): boolean =>
  Number.isFinite(value) && value > 0;

/**
 * Resolve the native top-left point that makes a secondary window visually
 * centered over its owner. Tauri's built-in `center` resolves against a
 * monitor, not the owner window, so it is not reliable once the owner is moved
 * between displays or spans monitors with different scale factors.
 */
export const resolveDesktopSecondaryWindowOwnerCenterPosition = (
  owner: DesktopSecondaryWindowPhysicalFrame | null | undefined,
  secondarySize: DesktopSecondaryWindowPhysicalSize | null | undefined,
): { x: number; y: number } | null => {
  const ownerX = Number(owner?.position.x);
  const ownerY = Number(owner?.position.y);
  const ownerWidth = Number(owner?.size.width);
  const ownerHeight = Number(owner?.size.height);
  const secondaryWidth = Number(secondarySize?.width);
  const secondaryHeight = Number(secondarySize?.height);

  if (
    !Number.isFinite(ownerX) ||
    !Number.isFinite(ownerY) ||
    !isFinitePhysicalDimension(ownerWidth) ||
    !isFinitePhysicalDimension(ownerHeight) ||
    !isFinitePhysicalDimension(secondaryWidth) ||
    !isFinitePhysicalDimension(secondaryHeight)
  ) {
    return null;
  }

  return {
    x: Math.round(ownerX + (ownerWidth - secondaryWidth) / 2),
    y: Math.round(ownerY + (ownerHeight - secondaryHeight) / 2),
  };
};

export const DESKTOP_SECONDARY_WINDOW_DEFAULT_SCALE = 0.9;
export const DESKTOP_SECONDARY_WINDOW_MIN_SCALE = 0.78;
const DESKTOP_SECONDARY_WINDOW_FIXED_SCALE_KINDS =
  new Set<DesktopSecondaryWindowKind>([
    "SYSTEM_GLOBAL_RESET_CONFIRM",
    "SPECIAL_TRAINING_BANK_DELETE_CONFIRM",
    "SPECIAL_TRAINING_MODE_RESTART_CONFIRM",
  ]);

export const resolveDesktopSecondaryWindowZoomBase = (
  kind: DesktopSecondaryWindowKind,
): DesktopSecondaryWindowZoomBase => {
  const geometry = DESKTOP_SECONDARY_WINDOW_GEOMETRY[kind];
  if (DESKTOP_SECONDARY_WINDOW_FIXED_SCALE_KINDS.has(kind)) {
    return {
      designWidth: geometry.width,
      designHeight: geometry.height,
      densityScale: 1,
      minScale: 1,
      maxScale: 1,
    };
  }
  return {
    designWidth: Math.ceil(
      geometry.width / DESKTOP_SECONDARY_WINDOW_DEFAULT_SCALE,
    ),
    designHeight: Math.ceil(
      geometry.height / DESKTOP_SECONDARY_WINDOW_DEFAULT_SCALE,
    ),
    densityScale: 1,
    minScale: DESKTOP_SECONDARY_WINDOW_MIN_SCALE,
    maxScale: 1,
  };
};

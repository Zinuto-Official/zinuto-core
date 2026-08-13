// SPDX-License-Identifier: GPL-3.0-only

import type { ReactNode } from "react";

export type IconVariant = "default" | "tool";

export type SvgIconConfig = {
  paths: ReactNode;
  variant?: IconVariant;
  viewBox?: string;
};

export type AppIconName =
  | "navCommandCenter"
  | "navTrainer"
  | "navChallengeHall"
  | "navChallengeStats"
  | "navStrategyBacktest"
  | "challengeModeFastDecisionHero"
  | "challengeModeRiskDisciplineHero"
  | "navHistory"
  | "navStats"
  | "navNotes"
  | "navCustomIndicator"
  | "navData"
  | "assetStock"
  | "assetFutures"
  | "assetForex"
  | "assetCrypto"
  | "navShortcut"
  | "settingsGear"
  | "chartTypeCandle"
  | "chartTypeLine"
  | "chartTypeOhlc"
  | "magnet"
  | "lineSolid"
  | "lineDashed"
  | "drawNote"
  | "actionVisible"
  | "actionHidden"
  | "subIndicatorsOn"
  | "subIndicatorsOff"
  | "actionRename"
  | "actionDelete"
  | "actionFolderImport"
  | "actionAdd"
  | "actionChevronRight"
  | "actionChevronDown"
  | "actionChevronLeft"
  | "actionCheck"
  | "actionSearch"
  | "actionWallet"
  | "actionMoreVertical"
  | "actionArrowUp"
  | "actionArrowDown"
  | "actionArrowLeft"
  | "actionArrowRight"
  | "actionFastForward"
  | "actionPlay"
  | "actionPlayPause"
  | "actionShuffleCross"
  | "statusCrown"
  | "statusLock"
  | "statusShieldCheck"
  | "statusTarget"
  | "statusTimer"
  | "statusBolt"
  | "statusFlame"
  | "windowMinimize"
  | "windowMaximize"
  | "windowRestore"
  | "windowClose";

export const APP_ICON_CONFIG: Record<AppIconName, SvgIconConfig> = {
  navCommandCenter: {
    paths: (
      <>
        <rect x="4" y="5" width="16" height="14" rx="3" />
        <path d="M7 15L10.2 11.8L12.8 13.7L17 9.5" />
        <circle cx="16.8" cy="8.8" r="1.8" />
        <path d="M8 9.2H11.2" />
      </>
    ),
  },
  navTrainer: {
    paths: (
      <>
        <path d="M4 19.5H20" />
        <path d="M6 15.5L10 11.5L13.2 13.8L18 8.5" />
        <path d="M18 8.5H15.2" />
        <path d="M18 8.5V11.3" />
      </>
    ),
  },
  navChallengeHall: {
    paths: (
      <>
        <circle cx="12" cy="12" r="7.6" />
        <path d="M12 2.8V5.4" />
        <path d="M12 18.6V21.2" />
        <path d="M2.8 12H5.4" />
        <path d="M18.6 12H21.2" />
        <circle cx="12" cy="12" r="1.3" />
      </>
    ),
  },
  navChallengeStats: {
    paths: (
      <>
        <path d="M4 19.5H20" />
        <path d="M6.4 19V14.2" />
        <path d="M10.4 19V11.2" />
        <path d="M14.4 19V15.4" />
        <circle cx="17.8" cy="7.6" r="2.3" />
        <path d="M16.5 9.6L15.8 12.2L17.8 11.2L19.8 12.2L19.1 9.6" />
      </>
    ),
  },
  navStrategyBacktest: {
    paths: (
      <>
        <rect x="4" y="4.8" width="16" height="14.4" rx="2.4" />
        <path d="M7.2 15.6L9.7 12.8L12.1 14.1L16.8 8.8" />
        <path d="M16.8 8.8H14.4" />
        <path d="M16.8 8.8V11.2" />
        <path d="M7.3 8.3H10.6" />
        <path d="M7.3 10.6H8.8" />
        <circle cx="9.7" cy="12.8" r="0.9" fill="currentColor" stroke="none" />
        <circle cx="16.8" cy="8.8" r="0.9" fill="currentColor" stroke="none" />
      </>
    ),
  },
  challengeModeFastDecisionHero: {
    paths: (
      <>
        <circle cx="12" cy="12" r="6.9" />
        <path d="M12 2.6V5" />
        <path d="M12 19V21.4" />
        <path d="M2.6 12H5" />
        <path d="M19 12H21.4" />
        <path
          d="M13.4 6.9L9.7 12.1H12.1L10.9 17.2L14.7 11.9H12.2L13.4 6.9Z"
          fill="currentColor"
          stroke="none"
        />
      </>
    ),
  },
  challengeModeRiskDisciplineHero: {
    paths: (
      <>
        <path d="M12 3.8L18.3 6.7V11.8C18.3 15.8 15.8 19.1 12 20.4C8.2 19.1 5.7 15.8 5.7 11.8V6.7L12 3.8Z" />
        <path d="M7.9 12.6H9.6L10.7 11L12.1 14.3L13.5 9.6L14.7 12.6H16.1" />
      </>
    ),
  },
  navHistory: {
    paths: (
      <>
        <path d="M3.5 12A8.5 8.5 0 1 0 5.9 6.1" />
        <path d="M3.5 5.9V9.4H7.1" />
        <path d="M12 8.3V12L14.8 13.8" />
      </>
    ),
  },
  navStats: {
    paths: (
      <>
        <path d="M4 19.5H21" />
        <path d="M6 19V13.2" />
        <path d="M10.5 19V9.8" />
        <path d="M15 19V14.4" />
        <path d="M19.5 19V7.2" />
        <path d="M5.4 13.6L10 10.2L13.4 12.1L18.8 8" />
      </>
    ),
  },
  navNotes: {
    paths: (
      <>
        <path d="M7 4.5H14.8L18.5 8.2V19.5H7Z" />
        <path d="M14.8 4.5V8.2H18.5" />
        <path d="M9.5 11.5H15.8" />
        <path d="M9.5 14.7H15.8" />
      </>
    ),
  },
  navCustomIndicator: {
    paths: (
      <>
        <path d="M5 5.5V18.5H19" />
        <path d="M7 15.8C8.8 12.6 10 9.2 12.1 9.2C14.4 9.2 14.8 14.8 16.6 14.8C17.3 14.8 17.9 13.9 19 12.2" />
      </>
    ),
  },
  navData: {
    paths: (
      <>
        <ellipse cx="12" cy="6.2" rx="6.5" ry="2.7" />
        <path d="M5.5 6.2V17.8C5.5 19.3 8.4 20.5 12 20.5C15.6 20.5 18.5 19.3 18.5 17.8V6.2" />
        <path d="M5.5 12C5.5 13.5 8.4 14.7 12 14.7C15.6 14.7 18.5 13.5 18.5 12" />
      </>
    ),
  },
  assetStock: {
    paths: (
      <>
        <path d="M4.5 19.5H19.5" />
        <path d="M7 16.5V12.6" />
        <path d="M11.2 16.5V8.8" />
        <path d="M15.4 16.5V6.3" />
        <path d="M6.4 11.9L10.6 9.2L13.1 11L17.4 6.8" />
      </>
    ),
  },
  assetFutures: {
    paths: (
      <>
        <path d="M4.6 8.4H19.4" />
        <path d="M4.6 15.6H19.4" />
        <path d="M8.1 5.4V18.6" />
        <path d="M15.9 5.4V18.6" />
        <path d="M8.1 8.4L15.9 15.6" />
      </>
    ),
  },
  assetForex: {
    paths: (
      <>
        <circle cx="12" cy="12" r="7.8" />
        <path d="M4.8 12H19.2" />
        <path d="M12 4.2C14.3 6.3 15.6 9 15.6 12C15.6 15 14.3 17.7 12 19.8" />
        <path d="M12 4.2C9.7 6.3 8.4 9 8.4 12C8.4 15 9.7 17.7 12 19.8" />
        <path d="M9.1 8.2H14.9" />
        <path d="M9.1 15.8H14.9" />
      </>
    ),
  },
  assetCrypto: {
    paths: (
      <>
        <path d="M12 3.9L18.4 7.4V16.6L12 20.1L5.6 16.6V7.4L12 3.9Z" />
        <path d="M9.3 10.4H13.1C14.4 10.4 15.3 11.2 15.3 12.2C15.3 13.2 14.4 14 13.1 14H9.3V8.8H12.9C14.1 8.8 14.9 9.5 14.9 10.4C14.9 11.2 14.1 11.9 12.9 11.9" />
      </>
    ),
  },
  navShortcut: {
    paths: (
      <>
        <rect x="4" y="6.2" width="16" height="11.6" rx="2.2" />
        <path d="M8 10H10" />
        <path d="M12 10H14" />
        <path d="M16 10H16.01" />
        <path d="M8 14H16" />
      </>
    ),
  },
  settingsGear: {
    paths: (
      <>
        <circle cx="12" cy="12" r="3.2" />
        <path d="M12 3.8V5.8" />
        <path d="M12 18.2V20.2" />
        <path d="M3.8 12H5.8" />
        <path d="M18.2 12H20.2" />
        <path d="M6.2 6.2L7.6 7.6" />
        <path d="M16.4 16.4L17.8 17.8" />
        <path d="M16.4 7.6L17.8 6.2" />
        <path d="M6.2 17.8L7.6 16.4" />
        <circle cx="12" cy="12" r="7.2" />
      </>
    ),
  },
  chartTypeCandle: {
    paths: (
      <>
        <path d="M6 5V8" />
        <rect x="4.7" y="8" width="2.6" height="7" rx="0.8" />
        <path d="M6 15V19" />
        <path d="M12 4V7" />
        <rect x="10.7" y="7" width="2.6" height="9" rx="0.8" />
        <path d="M12 16V20" />
        <path d="M18 6V10" />
        <rect x="16.7" y="10" width="2.6" height="5.2" rx="0.8" />
        <path d="M18 15.2V18.6" />
      </>
    ),
  },
  chartTypeLine: {
    paths: (
      <>
        <path d="M4.2 16.6C6.4 15 7.7 10.1 10.2 10.1C12.6 10.1 12.9 14.4 15.2 14.4C16.9 14.4 18 11.7 19.8 8.3" />
      </>
    ),
  },
  chartTypeOhlc: {
    paths: (
      <>
        <path d="M6 5.2V18.8" />
        <path d="M3.8 9.2H6" />
        <path d="M6 15H8.2" />
        <path d="M12 4.8V19.2" />
        <path d="M9.8 11.4H12" />
        <path d="M12 7.6H14.2" />
        <path d="M18 5.6V18.4" />
        <path d="M15.8 8.8H18" />
        <path d="M18 13.6H20.2" />
      </>
    ),
  },
  magnet: {
    paths: (
      <>
        <path d="M7 4.5V12a5 5 0 1 0 10 0V4.5" />
        <path d="M9.5 4.5V12a2.5 2.5 0 1 0 5 0V4.5" />
        <path d="M7 4.5H9.9" />
        <path d="M14.1 4.5H17" />
        <path d="M7 8H9.9" />
        <path d="M14.1 8H17" />
      </>
    ),
  },
  lineSolid: {
    paths: <path d="M4 12H20" />,
  },
  lineDashed: {
    paths: (
      <>
        <path d="M5 12H10" strokeLinecap="round" />
        <path d="M14 12H19" strokeLinecap="round" />
      </>
    ),
  },
  drawNote: {
    variant: "tool",
    paths: (
      <>
        <path
          d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
          strokeWidth={1.7}
        />
        <path d="M14 2v6h6" strokeWidth={1.7} />
        <path d="M16 13H8" strokeWidth={1.7} />
        <path d="M16 17H8" strokeWidth={1.7} />
        <path d="M10 9H8" strokeWidth={1.7} />
      </>
    ),
  },
  actionVisible: {
    paths: (
      <>
        <path d="M2.5 12C4.6 7.9 8 5.8 12 5.8C16 5.8 19.4 7.9 21.5 12C19.4 16.1 16 18.2 12 18.2C8 18.2 4.6 16.1 2.5 12Z" />
        <circle cx="12" cy="12" r="2.7" />
      </>
    ),
  },
  actionHidden: {
    paths: (
      <>
        <path d="M2.5 12C4.6 7.9 8 5.8 12 5.8C16 5.8 19.4 7.9 21.5 12C19.4 16.1 16 18.2 12 18.2C8 18.2 4.6 16.1 2.5 12Z" />
        <circle cx="12" cy="12" r="2.7" />
        <path d="M4 20L20 4" />
      </>
    ),
  },
  subIndicatorsOn: {
    paths: (
      <>
        <rect x="4" y="3.8" width="16" height="11.8" rx="2.2" />
        <rect
          x="4"
          y="16.3"
          width="16"
          height="3.9"
          rx="1.4"
          fill="currentColor"
          stroke="none"
        />
      </>
    ),
  },
  subIndicatorsOff: {
    paths: (
      <>
        <rect x="4" y="3.8" width="16" height="11.8" rx="2.2" />
        <rect x="4" y="16.3" width="16" height="3.9" rx="1.4" />
      </>
    ),
  },
  actionRename: {
    paths: (
      <>
        <path d="M4 20h4l10-10-4-4L4 16v4Z" />
        <path d="M12 6l4 4" />
      </>
    ),
  },
  actionDelete: {
    paths: (
      <>
        <path d="M6 6L18 18" />
        <path d="M18 6L6 18" />
      </>
    ),
  },
  actionFolderImport: {
    paths: (
      <>
        <path d="M3.5 7.5H9L11.3 10H20.5V18.2C20.5 19.3 19.6 20.2 18.5 20.2H5.5C4.4 20.2 3.5 19.3 3.5 18.2V7.5Z" />
        <path d="M3.5 10H20.5" />
      </>
    ),
  },
  actionAdd: {
    paths: (
      <>
        <path d="M12 5V19" />
        <path d="M5 12H19" />
      </>
    ),
  },
  actionChevronRight: {
    paths: <path d="M9 6L15 12L9 18" />,
  },
  actionChevronDown: {
    paths: <path d="M6 9L12 15L18 9" />,
  },
  actionChevronLeft: {
    paths: <path d="M15 6L9 12L15 18" />,
  },
  actionCheck: {
    paths: <path d="M5 12.5L9.1 16.4L19 7.4" />,
  },
  actionSearch: {
    paths: (
      <>
        <circle cx="10.5" cy="10.5" r="5.6" />
        <path d="M14.8 14.8L19.2 19.2" />
      </>
    ),
  },
  actionWallet: {
    paths: (
      <>
        <path d="M4.8 8.5C4.8 6.9 6.1 5.6 7.7 5.6H17.2C18.6 5.6 19.7 6.7 19.7 8.1V9.3H15.9C14.4 9.3 13.2 10.5 13.2 12C13.2 13.5 14.4 14.7 15.9 14.7H19.7V15.9C19.7 17.3 18.6 18.4 17.2 18.4H7.7C6.1 18.4 4.8 17.1 4.8 15.5Z" />
        <path d="M19.7 10.3H15.9C15 10.3 14.2 11.1 14.2 12C14.2 12.9 15 13.7 15.9 13.7H19.7Z" />
        <circle cx="15.9" cy="12" r="0.95" fill="currentColor" stroke="none" />
      </>
    ),
  },
  actionMoreVertical: {
    paths: (
      <>
        <circle cx="12" cy="6" r="1.8" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" />
        <circle cx="12" cy="18" r="1.8" fill="currentColor" stroke="none" />
      </>
    ),
  },
  actionArrowUp: {
    paths: (
      <>
        <path d="M12 19V5" />
        <path d="M7.5 9.5L12 5L16.5 9.5" />
      </>
    ),
  },
  actionArrowDown: {
    paths: (
      <>
        <path d="M12 5V19" />
        <path d="M7.5 14.5L12 19L16.5 14.5" />
      </>
    ),
  },
  actionArrowLeft: {
    paths: (
      <>
        <path d="M19 12H5" />
        <path d="M9.5 7.5L5 12L9.5 16.5" />
      </>
    ),
  },
  actionArrowRight: {
    paths: (
      <>
        <path d="M5 12H19" />
        <path d="M14.5 7.5L19 12L14.5 16.5" />
      </>
    ),
  },
  actionFastForward: {
    paths: (
      <>
        <path d="M4.8 6.2L10.8 12L4.8 17.8Z" />
        <path d="M11.2 6.2L17.2 12L11.2 17.8Z" />
        <path d="M18.4 5.8V18.2" />
      </>
    ),
  },
  actionPlay: {
    paths: (
      <path
        d="M8.2 5.8L17.4 12L8.2 18.2Z"
        fill="currentColor"
        stroke="none"
      />
    ),
  },
  actionPlayPause: {
    paths: (
      <>
        <path d="M6.2 5.4V18.6" />
        <path d="M10.2 5.4V18.6" />
        <path d="M14.2 6.6L19 12L14.2 17.4Z" />
      </>
    ),
  },
  actionShuffleCross: {
    paths: (
      <>
        <polyline points="16 3 21 3 21 8" />
        <line x1="4" y1="20" x2="21" y2="3" />
        <polyline points="21 16 21 21 16 21" />
        <line x1="15" y1="15" x2="21" y2="21" />
        <line x1="4" y1="4" x2="9" y2="9" />
      </>
    ),
  },
  statusCrown: {
    paths: (
      <>
        <path d="M4.6 17.8L6.8 7.6L11 12.1L15.2 7.3L19.4 12.1L21.4 6.8L19.6 17.8Z" />
        <path d="M5.4 17.8H20.2" />
      </>
    ),
  },
  statusLock: {
    paths: (
      <>
        <path d="M8.9 10.15V8.45C8.9 6.56 10.3 5.15 12 5.15C13.7 5.15 15.1 6.56 15.1 8.45V10.15" />
        <rect x="6.45" y="10.15" width="11.1" height="8.7" rx="2.4" />
        <path
          d="M12 13.2C11.37 13.2 10.86 13.71 10.86 14.34C10.86 14.81 11.15 15.21 11.55 15.39V16.5C11.55 16.75 11.75 16.95 12 16.95C12.25 16.95 12.45 16.75 12.45 16.5V15.39C12.85 15.21 13.14 14.81 13.14 14.34C13.14 13.71 12.63 13.2 12 13.2Z"
          fill="currentColor"
          stroke="none"
        />
      </>
    ),
  },
  statusShieldCheck: {
    paths: (
      <>
        <path d="M12 3.9L18.4 6.7V11.4C18.4 15.3 15.9 18.8 12 20.1C8.1 18.8 5.6 15.3 5.6 11.4V6.7L12 3.9Z" />
        <path d="M9.1 12.3L11 14.2L15 10.2" />
      </>
    ),
  },
  statusTarget: {
    paths: (
      <>
        <circle cx="12" cy="12" r="7.8" />
        <circle cx="12" cy="12" r="3.6" />
        <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
      </>
    ),
  },
  statusTimer: {
    paths: (
      <>
        <circle cx="12" cy="13" r="7.2" />
        <path d="M12 13V9.6" />
        <path d="M12 13L14.6 14.8" />
        <path d="M9.2 3.8H14.8" />
        <path d="M12 3.8V5.6" />
      </>
    ),
  },
  statusBolt: {
    paths: (
      <>
        <path d="M13.6 3.8L8.9 11.7H12.1L10.8 20.2L15.8 12H12.9L13.6 3.8Z" />
      </>
    ),
  },
  statusFlame: {
    paths: (
      <>
        <path d="M12.1 4.2C13.8 6.2 15.9 8.2 15.9 11.2C15.9 13.6 14.2 15.8 12 17.2C9.8 15.9 8.1 13.7 8.1 11.2C8.1 9.4 8.9 8 10 6.7C10.9 7.6 11.5 8.6 11.8 9.8C12.5 8.2 12.7 6.4 12.1 4.2Z" />
        <path d="M12 10.1C12.8 11 13.4 11.9 13.4 13C13.4 14.1 12.8 15 12 15.6C11.2 15 10.6 14.1 10.6 13C10.6 12.2 11 11.4 11.6 10.7" />
      </>
    ),
  },
  windowMinimize: {
    paths: <path d="M5 16H19" />,
  },
  windowMaximize: {
    paths: <rect x="5" y="5" width="14" height="14" />,
  },
  windowRestore: {
    paths: (
      <>
        <path d="M8 7V5H19V16H17" />
        <rect x="5" y="8" width="11" height="11" />
      </>
    ),
  },
  windowClose: {
    paths: (
      <>
        <path d="M6 6L18 18" />
        <path d="M18 6L6 18" />
      </>
    ),
  },
};

export type DrawToolKey =
  | "cursor"
  | "segment"
  | "straightLine"
  | "horizontalStraightLine"
  | "horizontalRayLine"
  | "horizontalSegment"
  | "rayLine"
  | "parallelStraightLine"
  | "verticalStraightLine"
  | "verticalRayLine"
  | "verticalSegment"
  | "priceChannelLine"
  | "fibonacciLine"
  | "priceLine"
  | "simpleTag"
  | "simpleAnnotation";

export type DrawToolIconName = DrawToolKey | (string & {});

export const DRAW_TOOL_ICON_PATHS: Record<DrawToolKey, ReactNode> = {
  cursor: (
    <path
      d="M6 3L18 13H13L15 21L11.5 22L9.4 14.2L6 17V3Z"
      fill="currentColor"
      stroke="none"
    />
  ),
  segment: (
    <>
      <path d="M4 18L20 6" />
      <circle cx="4" cy="18" r="2.2" />
      <circle cx="20" cy="6" r="2.2" />
    </>
  ),
  straightLine: <path d="M2 19L22 5" />,
  horizontalStraightLine: <path d="M3 12H21" />,
  horizontalRayLine: (
    <>
      <path d="M5 12H21" />
      <circle cx="5" cy="12" r="2.1" />
    </>
  ),
  horizontalSegment: (
    <>
      <path d="M5 12H19" />
      <circle cx="5" cy="12" r="2.1" />
      <circle cx="19" cy="12" r="2.1" />
    </>
  ),
  rayLine: (
    <>
      <path d="M4 16L20 8" />
      <circle cx="4" cy="16" r="2" />
    </>
  ),
  parallelStraightLine: (
    <>
      <path d="M4 16L20 9" />
      <path d="M4 20L20 13" />
    </>
  ),
  verticalStraightLine: <path d="M12 3V21" />,
  verticalRayLine: (
    <>
      <path d="M12 5V21" />
      <circle cx="12" cy="5" r="2.1" />
    </>
  ),
  verticalSegment: (
    <>
      <path d="M12 5V19" />
      <circle cx="12" cy="5" r="2.1" />
      <circle cx="12" cy="19" r="2.1" />
    </>
  ),
  priceChannelLine: (
    <>
      <path d="M3 16L21 8" />
      <path d="M3 20L21 12" />
      <path d="M6.2 14.6V18.6" />
      <path d="M17.8 9.4V13.4" />
    </>
  ),
  fibonacciLine: (
    <>
      <path d="M5 6H19" />
      <path d="M5 10H17" />
      <path d="M5 14H15" />
      <path d="M5 18H13" />
    </>
  ),
  priceLine: (
    <>
      <path d="M3 12H21" />
      <rect x="13.4" y="7.6" width="7" height="8.8" rx="1.6" />
    </>
  ),
  simpleTag: (
    <>
      <path d="M3 12H21" strokeDasharray="3 2" />
      <path d="M14.5 8.7H20.2" />
    </>
  ),
  simpleAnnotation: (
    <>
      <path d="M12 18V6" />
      <path d="M9.4 8.8L12 6L14.6 8.8" />
      <path d="M7 20H17" />
    </>
  ),
};

export const DRAW_TOOL_ICON_FALLBACK: ReactNode = (
  <>
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <path d="M8 9H16" />
    <path d="M12 9V16" />
  </>
);

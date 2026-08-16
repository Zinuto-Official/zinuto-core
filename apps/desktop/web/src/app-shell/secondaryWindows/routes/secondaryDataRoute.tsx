// SPDX-License-Identifier: GPL-3.0-only

import "@/styles/popup-data.css";
import "@/styles/popup-replay.css";

import {
  closeCurrentDesktopSecondaryWindow,
  sendDesktopSecondaryWindowRouteAction,
  sendDesktopSecondaryWindowRouteActionWithAck,
} from "@/app-shell/secondaryWindows/desktopSecondaryWindowBridge";
import {
  AppCsvMappingModal,
  AppCsvMappingModalProps,
} from "@/app-shell/AppCsvMappingModal";
import {
  DataConfigDetailWindowPanel,
  DataConfigDetailWindowPayload,
} from "@/workspaces/data/DataConfigDetailDrawer";
import { formatStorageBytes } from "@/frontend-kernel/uiOptions";
import { MarketDataAcquisitionSection } from "@/workspaces/data";
import {
  ttByLanguage,
  ttfByLanguage,
} from "@/frontend-kernel/i18n/messageRuntime";
import {
  SecondaryWindowRoutePlaceholder,
  type SecondaryWindowRouteProps,
} from "@/app-shell/secondaryWindows/routes/secondaryWindowRouteTypes";

type CsvImportConfigPayload = Omit<
  AppCsvMappingModalProps,
  | "presentation"
  | "tt"
  | "ttf"
  | "onPendingImportTimeZoneChange"
  | "onConfirmPendingImportTimeZone"
  | "onResetPendingImportTimeZoneRecommendation"
  | "onPendingImportTradingCalendarChange"
  | "onResetPendingImportTradingCalendarRecommendation"
  | "onPendingImportScopeStrategyChange"
  | "onUpdatePendingCsvTimestampMode"
  | "onUpdatePendingCsvMapping"
  | "onPendingPlanPoolNameChange"
  | "onPendingPlanSourceIdChange"
  | "onCancelPendingCsvImport"
  | "onConfirmPendingCsvImport"
>;

const MARKET_DATA_IMPORT_HANDOFF_ACK_TIMEOUT_MS = 2 * 60 * 60 * 1000;

const isCsvImportConfigPayload = (
  value: unknown,
): value is CsvImportConfigPayload =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  "pendingImport" in value;

const isDataConfigDetailWindowPayload = (
  value: unknown,
): value is DataConfigDetailWindowPayload =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Boolean((value as DataConfigDetailWindowPayload).pool) &&
  Boolean((value as DataConfigDetailWindowPayload).symbols) &&
  Boolean((value as DataConfigDetailWindowPayload).sourceDiagnostics);

const CsvImportConfigSecondaryWindow = ({
  state,
  language,
}: SecondaryWindowRouteProps) => {
  if (!isCsvImportConfigPayload(state.payload)) {
    return <SecondaryWindowRoutePlaceholder state={state} />;
  }
  const payload = state.payload;
  const emitSafely = (action: string, nextPayload?: unknown) =>
    sendDesktopSecondaryWindowRouteAction(state, action, nextPayload).catch(
      () => undefined,
    );

  return (
    <AppCsvMappingModal
      {...payload}
      presentation="window"
      tt={(key) =>
        ttByLanguage(language, key as Parameters<typeof ttByLanguage>[1])
      }
      ttf={(key, values) =>
        ttfByLanguage(
          language,
          key as Parameters<typeof ttfByLanguage>[1],
          values,
        )
      }
      onPendingImportTimeZoneChange={(timeZone) =>
        emitSafely("SET_TIME_ZONE", { timeZone })
      }
      onConfirmPendingImportTimeZone={() => emitSafely("CONFIRM_TIME_ZONE")}
      onResetPendingImportTimeZoneRecommendation={() => emitSafely("RESET_TIME_ZONE")}
      onPendingImportTradingCalendarChange={(tradingCalendar) =>
        emitSafely("SET_TRADING_CALENDAR", { tradingCalendar })
      }
      onResetPendingImportTradingCalendarRecommendation={() =>
        emitSafely("RESET_TRADING_CALENDAR")
      }
      onPendingImportScopeStrategyChange={(strategy) =>
        emitSafely("SET_SCOPE_STRATEGY", { strategy })
      }
      onUpdatePendingCsvTimestampMode={(mode) =>
        emitSafely("SET_TIMESTAMP_MODE", { mode })
      }
      onUpdatePendingCsvMapping={(field, value) =>
        emitSafely("SET_FIELD_MAPPING", { field, value })
      }
      onPendingPlanPoolNameChange={(planId, poolName) =>
        emitSafely("SET_PLAN_POOL_NAME", { planId, poolName })
      }
      onPendingPlanSourceIdChange={(planId, sourceId) =>
        emitSafely("SET_PLAN_SOURCE_ID", { planId, sourceId })
      }
      onCancelPendingCsvImport={() => {
        void emitSafely("CANCEL");
        void closeCurrentDesktopSecondaryWindow();
      }}
      onConfirmPendingCsvImport={async (options) => {
        const ack = await sendDesktopSecondaryWindowRouteActionWithAck(
          state,
          "CONFIRM",
          options,
        );
        if (ack.status === "ACCEPTED") {
          await closeCurrentDesktopSecondaryWindow();
          return { accepted: true };
        }
        return {
          accepted: false,
          code: "VALIDATION_FAILED",
          reason:
            String(ack.reason || "").trim() ||
            ttByLanguage(language, "appText.importPreviewFailed"),
        };
      }}
    />
  );
};

const DataConfigDetailSecondaryWindow = ({
  state,
  language,
  themeMode,
  showGlobalDecimals,
  priceColorMode,
  tradeColorTheme,
}: SecondaryWindowRouteProps) => {
  if (!isDataConfigDetailWindowPayload(state.payload)) {
    return <SecondaryWindowRoutePlaceholder state={state} />;
  }
  const payload = state.payload;
  return (
    <section className="desktop-secondary-window-panel desktop-secondary-window-data-config-detail">
        <DataConfigDetailWindowPanel
        payload={payload}
        language={language}
        themeMode={themeMode}
        showGlobalDecimals={showGlobalDecimals}
        priceColorMode={priceColorMode}
        tradeColorTheme={tradeColorTheme}
        onAction={(action) => {
          void sendDesktopSecondaryWindowRouteAction(
            state,
            action.action,
            "payload" in action ? action.payload : undefined,
          ).catch(() => undefined);
          if (action.action === "CLOSE") {
            void closeCurrentDesktopSecondaryWindow();
          }
        }}
      />
    </section>
  );
};

const MarketDataAcquisitionSecondaryWindow = ({
  state,
  language,
}: SecondaryWindowRouteProps) => {
  const payload =
    state.payload &&
    typeof state.payload === "object" &&
    !Array.isArray(state.payload)
      ? (state.payload as Record<string, unknown>)
      : {};
  const requestImport = async (
    folderPath: string,
    options?: { sourceFolderBookmarkId?: string },
  ) => {
    const ack = await sendDesktopSecondaryWindowRouteActionWithAck(
      state,
      "REQUEST_IMPORT",
      {
        folderPath,
        sourceFolderBookmarkId: options?.sourceFolderBookmarkId,
      },
      { timeoutMs: MARKET_DATA_IMPORT_HANDOFF_ACK_TIMEOUT_MS },
    );
    if (ack.status !== "ACCEPTED") {
      throw new Error(
        String(ack.reason || "").trim() ||
          ttByLanguage(
            language,
            "appText.marketDataAcquisitionImportStartFailed",
          ),
      );
    }
    await closeCurrentDesktopSecondaryWindow();
  };

  return (
    <MarketDataAcquisitionSection
      formatStorageBytes={formatStorageBytes}
      isImportEntryBlocked={payload.isImportEntryBlocked === true}
      locale={language}
      openCsvFolderPathAndPrepareImport={requestImport}
      onCloseWindow={() => {
        void closeCurrentDesktopSecondaryWindow();
      }}
      tt={(key) =>
        ttByLanguage(language, key as Parameters<typeof ttByLanguage>[1])
      }
      ttf={(key, values) =>
        ttfByLanguage(
          language,
          key as Parameters<typeof ttfByLanguage>[1],
          values,
        )
      }
    />
  );
};

const SecondaryDataRoute = (props: SecondaryWindowRouteProps) => {
  if (props.kind === "SAMPLE_POOL_IMPORT_CONFIG") {
    return <CsvImportConfigSecondaryWindow {...props} />;
  }
  if (props.kind === "MARKET_DATA_ACQUISITION") {
    return <MarketDataAcquisitionSecondaryWindow {...props} />;
  }
  if (props.kind === "DATA_CONFIG_DETAIL") {
    return <DataConfigDetailSecondaryWindow {...props} />;
  }
  return <SecondaryWindowRoutePlaceholder state={props.state} />;
};

export default SecondaryDataRoute;

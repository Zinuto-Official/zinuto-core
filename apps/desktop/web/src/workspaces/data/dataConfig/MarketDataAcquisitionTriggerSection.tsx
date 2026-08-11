// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, useRef } from "react";
import { api } from "@/api";
import { VendorIcon } from "@/assets/graphics";
import { Button } from "@/ui/primitives/button";
import "@/workspaces/data/dataConfig/market-data-acquisition.css";

type Translate = (key: string) => string;

type MarketDataAcquisitionTriggerSectionProps = {
  isImportEntryBlocked: boolean;
  presentation?: "decision" | "toolbar";
  tt: Translate;
};

export const MarketDataAcquisitionTriggerSection = ({
  isImportEntryBlocked,
  presentation = "toolbar",
  tt,
}: MarketDataAcquisitionTriggerSectionProps) => {
  const windowOpenedRef = useRef(false);
  const windowOpeningRef = useRef(false);
  const windowRevisionRef = useRef(0);
  const windowOperationGenerationRef = useRef(0);

  const openAcquisitionWindow = useCallback(() => {
    if (windowOpenedRef.current || windowOpeningRef.current) {
      return;
    }
    const operationGeneration = windowOperationGenerationRef.current + 1;
    windowOperationGenerationRef.current = operationGeneration;
    windowOpenedRef.current = true;
    windowOpeningRef.current = true;
    void api
      .openDesktopSecondaryWindow({
        kind: "MARKET_DATA_ACQUISITION",
        title: tt("appText.marketDataAcquisitionDialogTitle"),
        payload: { isImportEntryBlocked },
      })
      .then((state) => {
        if (
          windowOperationGenerationRef.current !== operationGeneration ||
          !windowOpenedRef.current
        ) {
          return;
        }
        windowOpeningRef.current = false;
        windowRevisionRef.current = Math.max(
          windowRevisionRef.current,
          state.revision,
        );
      })
      .catch(() => {
        if (windowOperationGenerationRef.current !== operationGeneration) {
          return;
        }
        windowOpenedRef.current = false;
        windowOpeningRef.current = false;
        windowRevisionRef.current = 0;
      });
  }, [isImportEntryBlocked, tt]);

  useEffect(() => {
    if (!windowOpenedRef.current) {
      return;
    }
    const operationGeneration = windowOperationGenerationRef.current + 1;
    windowOperationGenerationRef.current = operationGeneration;
    void api
      .publishDesktopSecondaryWindowState({
        kind: "MARKET_DATA_ACQUISITION",
        title: tt("appText.marketDataAcquisitionDialogTitle"),
        payload: { isImportEntryBlocked },
      })
      .then((state) => {
        if (
          windowOperationGenerationRef.current !== operationGeneration ||
          !windowOpenedRef.current
        ) {
          return;
        }
        windowOpeningRef.current = false;
        windowRevisionRef.current = Math.max(
          windowRevisionRef.current,
          state.revision,
        );
      })
      .catch(() => {
        if (windowOperationGenerationRef.current !== operationGeneration) {
          return;
        }
        windowOpenedRef.current = false;
        windowOpeningRef.current = false;
        windowRevisionRef.current = 0;
      });
  }, [isImportEntryBlocked, tt]);

  useEffect(
    () =>
      api.subscribeDesktopSecondaryWindowActions((message) => {
        if (message.kind !== "MARKET_DATA_ACQUISITION") {
          return;
        }
        if (
          !api.isCurrentDesktopSecondaryWindowAction(
            message,
            windowRevisionRef.current,
          )
        ) {
          return;
        }
        if (message.action === "WINDOW_CLOSED") {
          windowOperationGenerationRef.current += 1;
          windowOpenedRef.current = false;
          windowOpeningRef.current = false;
          windowRevisionRef.current = 0;
        }
      }),
    [],
  );

  if (presentation === "toolbar") {
    return (
      <Button
        type="button"
        variant="outline"
        className="data-config-acquisition-toolbar-trigger"
        data-onboarding-target="LOCAL_IMPORT_SAMPLE"
        disabled={isImportEntryBlocked}
        onClick={openAcquisitionWindow}
      >
        <VendorIcon name="download" aria-hidden="true" />
        <span>{tt("appText.marketDataAcquisitionOpenAction")}</span>
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="secondary"
      className="data-config-acquisition-choice"
      data-onboarding-target="LOCAL_IMPORT_SAMPLE"
      disabled={isImportEntryBlocked}
      onClick={openAcquisitionWindow}
    >
      <span className="data-config-acquisition-choice-icon" aria-hidden="true">
        <VendorIcon name="download" />
      </span>
      <span className="data-config-acquisition-choice-copy">
        <strong>{tt("appText.marketDataAcquisitionSectionTitle")}</strong>
        <span>{tt("appText.marketDataAcquisitionDisclaimer")}</span>
        <span className="data-config-acquisition-choice-action">
          {tt("appText.marketDataAcquisitionOpenAction")}
        </span>
      </span>
    </Button>
  );
};

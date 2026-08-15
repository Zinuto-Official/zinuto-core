// SPDX-License-Identifier: GPL-3.0-only

import type { MarketDataAcquisitionMarketJob } from "@/api";
import { VendorIcon } from "@/assets/graphics";
import { Spinner } from "@/ui/primitives/loading";
import type { AcquisitionDialogPhase } from "@/workspaces/data/dataConfig/MarketDataAcquisitionSection";
import type { MarketDataAcquisitionValidationDetail } from "@/workspaces/data/dataConfig/marketDataAcquisitionModel";

type Translate = (key: string) => string;
type TranslateFormatted = (key: string, values?: Array<unknown>) => string;

type AcquisitionStatePhase = Exclude<AcquisitionDialogPhase, "FORM">;

const resolveStageKey = (job: MarketDataAcquisitionMarketJob | null): string => {
  switch (job?.progress.stage) {
    case "CONNECTING":
      return "appText.marketDataAcquisitionStageConnecting";
    case "DOWNLOADING":
      return "appText.marketDataAcquisitionStageDownloading";
    case "NORMALIZING":
      return "appText.marketDataAcquisitionStageNormalizing";
    case "VALIDATING":
      return "appText.marketDataAcquisitionStageValidating";
    case "READY_TO_SAVE":
      return "appText.marketDataAcquisitionStageReadyToSave";
    case "QUEUED":
    default:
      return "appText.marketDataAcquisitionStageQueued";
  }
};

type MarketDataAcquisitionStatePageProps = {
  job: MarketDataAcquisitionMarketJob | null;
  phase: AcquisitionStatePhase;
  progressPercent: number;
  runtimeErrorText: string;
  statusErrorText: string;
  tt: Translate;
  ttf: TranslateFormatted;
  validationDetail: MarketDataAcquisitionValidationDetail | null;
};

export const MarketDataAcquisitionStatePage = ({
  job,
  phase,
  progressPercent,
  runtimeErrorText,
  statusErrorText,
  tt,
  ttf,
  validationDetail,
}: MarketDataAcquisitionStatePageProps) => (
  <section
    className="market-data-acquisition-state-page"
    role={phase === "FAILED" ? "alert" : "status"}
    aria-live="polite"
  >
    <span
      className="market-data-acquisition-state-icon"
      data-tone={
        phase === "FAILED"
          ? "danger"
          : phase === "CANCELED"
            ? "neutral"
            : "progress"
      }
      aria-hidden="true"
    >
      {phase === "RUNNING" || phase === "SAVING" ? (
        <Spinner decorative />
      ) : (
        <VendorIcon name={phase === "FAILED" ? "alertTriangle" : "circleAlert"} />
      )}
    </span>
    <div>
      <h2>
        {tt(
          phase === "RUNNING"
            ? "appText.marketDataAcquisitionRunningTitle"
            : phase === "SAVING"
              ? "appText.marketDataAcquisitionSavingTitle"
              : phase === "READY_TO_SAVE"
                ? "appText.marketDataAcquisitionReadyToSaveTitle"
                : phase === "FAILED"
                  ? "appText.marketDataAcquisitionFailedTitle"
                  : "appText.marketDataAcquisitionCanceledTitle",
        )}
      </h2>
      <p>
        {phase === "RUNNING"
          ? runtimeErrorText ||
            (job?.progress.stage === "RETRY_WAIT"
              ? ttf("appText.marketDataAcquisitionStageRetryWaitValue0Value1", [
                  Math.max(1, Math.ceil(job.progress.retryAfterMs / 1_000)),
                  job.progress.retryAttempt,
                ])
              : tt(resolveStageKey(job)))
          : phase === "SAVING"
            ? tt("appText.marketDataAcquisitionSavingDescription")
            : phase === "READY_TO_SAVE"
              ? statusErrorText
              : phase === "FAILED"
                ? statusErrorText
                : tt("appText.marketDataAcquisitionCanceledDescription")}
      </p>
      {phase === "FAILED" && validationDetail ? (
        <p className="market-data-acquisition-validation-detail">
          {ttf(validationDetail.key, validationDetail.params)}
        </p>
      ) : null}
    </div>
    {phase === "RUNNING" ? (
      <div className="market-data-acquisition-progress">
        <div>
          <span>{tt("appText.marketDataAcquisitionProgressLabel")}</span>
          <strong>
            {progressPercent}
            {tt("common.symbol.percent")}
          </strong>
        </div>
        <progress value={progressPercent} max={100} />
      </div>
    ) : null}
    <div className="market-data-acquisition-notice market-data-acquisition-state-boundary">
      <VendorIcon name="folderCheck" aria-hidden="true" />
      <span>{tt("appText.marketDataAcquisitionStateBoundaryNotice")}</span>
    </div>
  </section>
);

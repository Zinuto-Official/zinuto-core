// SPDX-License-Identifier: GPL-3.0-only

import { useState } from "react";
import { VendorIcon } from "@/assets/graphics/AppIcons";
import { Button } from "@/ui/primitives/button";
import {
  getCustomIndicatorAiConversionGuideCopy,
  type AppUiLanguage,
} from "@/ui/config/uiConfig";
import type { UiLabelEntry } from "@/ui/config/uiLabels";
import {
  buildCustomIndicatorAiConversionGuideFilename,
  downloadCustomIndicatorAiConversionGuide,
} from "@/workspaces/custom-indicator/referenceCenter/aiConversionGuide";

type CustomIndicatorAiConversionGuidePanelProps = {
  language: AppUiLanguage;
  ui: UiLabelEntry;
  onClose: () => void;
};

export const CustomIndicatorAiConversionGuidePanel = ({
  language,
  ui,
  onClose,
}: CustomIndicatorAiConversionGuidePanelProps) => {
  const copy = getCustomIndicatorAiConversionGuideCopy(language);
  const [downloadState, setDownloadState] = useState<
    "idle" | "saving" | "saved" | "failed"
  >("idle");
  const filename = buildCustomIndicatorAiConversionGuideFilename(language);
  const isSaving = downloadState === "saving";

  const handleDownload = async () => {
    if (isSaving) {
      return;
    }
    setDownloadState("saving");
    try {
      const saved = await downloadCustomIndicatorAiConversionGuide(language, ui);
      setDownloadState(saved ? "saved" : "idle");
    } catch {
      setDownloadState("failed");
    }
  };

  return (
    <section
      className="custom-indicator-ai-guide-panel"
      aria-labelledby="custom-indicator-ai-guide-title"
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="custom-indicator-ai-guide-back"
        onClick={onClose}
      >
        <VendorIcon name="chevronLeft" data-icon="inline-start" />
        {copy.referenceUi.closeGuideLabel}
      </Button>

      <div className="custom-indicator-ai-guide-download-card">
        <span
          className="custom-indicator-ai-guide-download-icon"
          aria-hidden="true"
        >
          <VendorIcon name="code2" />
        </span>
        <div className="custom-indicator-ai-guide-download-copy">
          <h4 id="custom-indicator-ai-guide-title">{copy.title}</h4>
          <p>{copy.summary}</p>
        </div>
        <Button
          type="button"
          variant="default"
          size="sm"
          className="custom-indicator-ai-guide-download-button"
          disabled={isSaving}
          onClick={() => void handleDownload()}
        >
          <VendorIcon name="download" data-icon="inline-start" />
          {copy.referenceUi.downloadGuideLabel}
        </Button>
      </div>

      <p
        className="custom-indicator-ai-guide-download-status"
        role="status"
        aria-live="polite"
      >
        {downloadState === "saved" ? (
          <>
            <span>{ui.customIndicatorAiGuideDownloadStarted}</span>
            <span>
              {ui.customIndicatorAiGuideDownloadFilePrefix}
              {filename}
            </span>
          </>
        ) : downloadState === "failed" ? (
          <span>{ui.customIndicatorAiGuideDownloadFailed}</span>
        ) : null}
      </p>
    </section>
  );
};

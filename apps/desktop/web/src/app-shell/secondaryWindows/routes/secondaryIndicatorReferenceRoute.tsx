// SPDX-License-Identifier: GPL-3.0-only

import "@/styles/popup-challenge.css";

import { useEffect, useMemo, useRef } from "react";
import { closeCurrentDesktopSecondaryWindow } from "@/app-shell/secondaryWindows/desktopSecondaryWindowBridge";
import { getUiLabels } from "@/ui/config/uiLabels";
import { CustomIndicatorReferenceCenterDialog } from "@/workspaces/custom-indicator/dialogs/CustomIndicatorReferenceCenterDialog";
import { useCustomIndicatorReferenceCenterController } from "@/workspaces/custom-indicator/referenceCenter/useCustomIndicatorReferenceCenterController";
import type { SecondaryWindowRouteProps } from "@/app-shell/secondaryWindows/routes/secondaryWindowRouteTypes";

const SecondaryIndicatorReferenceRoute = ({
  language,
}: SecondaryWindowRouteProps) => {
  const ui = useMemo(() => getUiLabels(language), [language]);
  const rulesSearchInputRef = useRef<HTMLInputElement | null>(null);
  const {
    activeReferenceCenterDocModule,
    activeReferenceCenterRelatedTopics,
    activeReferenceCenterTopic,
    collapseAllReferenceCollections,
    expandedReferenceCollectionIds,
    expandAllReferenceCollections,
    filteredReferenceCollections,
    isReferenceSearchPending,
    openReferenceCenter,
    referenceKeyword,
    referenceSelectionHint,
    selectedReferenceTopicId,
    setReferenceKeyword,
    setSelectedReferenceTopicId,
    toggleReferenceCollection,
  } = useCustomIndicatorReferenceCenterController({ language, ui });

  useEffect(() => {
    openReferenceCenter();
  }, [openReferenceCenter]);

  return (
    <CustomIndicatorReferenceCenterDialog
      presentation="window"
      language={language}
      ui={ui}
      isOpen
      onOpenChange={(open) => {
        if (!open) {
          void closeCurrentDesktopSecondaryWindow();
        }
      }}
      activeReferenceCenterDocModule={activeReferenceCenterDocModule}
      activeReferenceCenterRelatedTopics={activeReferenceCenterRelatedTopics}
      activeReferenceCenterTopic={activeReferenceCenterTopic}
      isReferenceSearchPending={isReferenceSearchPending}
      expandedReferenceCollectionIds={expandedReferenceCollectionIds}
      filteredReferenceCollections={filteredReferenceCollections}
      selectedReferenceTopicId={selectedReferenceTopicId}
      referenceKeyword={referenceKeyword}
      referenceSelectionHint={referenceSelectionHint}
      rulesSearchInputRef={rulesSearchInputRef}
      onSetReferenceKeyword={setReferenceKeyword}
      onExpandAllReferenceCollections={expandAllReferenceCollections}
      onCollapseAllReferenceCollections={collapseAllReferenceCollections}
      onToggleReferenceCollection={toggleReferenceCollection}
      onSelectReferenceTopic={setSelectedReferenceTopicId}
    />
  );
};

export default SecondaryIndicatorReferenceRoute;

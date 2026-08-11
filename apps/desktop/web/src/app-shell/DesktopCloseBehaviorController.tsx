// SPDX-License-Identifier: GPL-3.0-only

import type { DesktopCloseButtonAction } from "@/frontend-kernel/windowBehaviorTypes";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { api } from "@/api";
import { AppModal } from "@/ui/components/AppModal";
import {
  buildUiSettingsWithDesktopCloseButtonAction,
} from "@/app-shell/desktopCloseBehavior";
import {
  resolveDesktopCloseRequestPlan,
  type DesktopCloseRequestPlan,
} from "@/frontend-kernel/windowBehavior";
import type {
  UiSettings
} from "@/frontend-kernel/appTypes";
import { useI18n } from "@/frontend-kernel/i18n";
import { Button } from "@/ui/primitives/button";
import { Checkbox } from "@/ui/primitives/checkbox";
import { StandardModalFrame } from "@/ui/components";

type CloseExecutionAction = Extract<
  DesktopCloseButtonAction,
  "MINIMIZE_TO_TRAY" | "QUIT"
>;

export type DesktopCloseBehaviorControllerProps = {
  desktopCloseButtonAction: DesktopCloseButtonAction;
  setDesktopCloseButtonAction: Dispatch<
    SetStateAction<DesktopCloseButtonAction>
  >;
  buildUiSettings: () => UiSettings;
  canPersistUiSettings: boolean;
};

const executeDesktopClosePlan = async (
  plan: Exclude<DesktopCloseRequestPlan, "PROMPT">,
): Promise<void> => {
  if (plan === "QUIT") {
    await api.quitDesktopApp();
    return;
  }
  await api.hideDesktopAppToTray();
};

export const DesktopCloseBehaviorController = ({
  desktopCloseButtonAction,
  setDesktopCloseButtonAction,
  buildUiSettings,
  canPersistUiSettings,
}: DesktopCloseBehaviorControllerProps) => {
  const { t } = useI18n();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [rememberSelection, setRememberSelection] = useState(false);
  const [pendingAction, setPendingAction] =
    useState<CloseExecutionAction | null>(null);
  const desktopCloseButtonActionRef = useRef(desktopCloseButtonAction);
  const isExecutingCloseActionRef = useRef(false);

  useEffect(() => {
    desktopCloseButtonActionRef.current = desktopCloseButtonAction;
  }, [desktopCloseButtonAction]);

  const runCloseAction = useCallback(async (action: CloseExecutionAction) => {
    if (isExecutingCloseActionRef.current) {
      return;
    }
    isExecutingCloseActionRef.current = true;
    try {
      await executeDesktopClosePlan(action);
    } finally {
      isExecutingCloseActionRef.current = false;
    }
  }, []);

  const rememberCloseAction = useCallback(
    async (action: CloseExecutionAction) => {
      if (!canPersistUiSettings) {
        return;
      }
      const nextSettings = buildUiSettingsWithDesktopCloseButtonAction(
        buildUiSettings(),
        action,
      );
      await api.updateAppUiSettings(nextSettings as Record<string, unknown>);
      setDesktopCloseButtonAction(action);
    },
    [buildUiSettings, canPersistUiSettings, setDesktopCloseButtonAction],
  );

  const handleDialogClose = useCallback(() => {
    if (pendingAction) {
      return;
    }
    setDialogOpen(false);
  }, [pendingAction]);

  const handleCloseChoice = useCallback(
    (action: CloseExecutionAction) => {
      setPendingAction(action);
      void Promise.resolve()
        .then(async () => {
          if (rememberSelection) {
            await rememberCloseAction(action).catch(() => undefined);
          }
          setDialogOpen(false);
          await runCloseAction(action);
        })
        .catch(() => {
          setDialogOpen(true);
        })
        .finally(() => {
          setPendingAction(null);
        });
    },
    [rememberCloseAction, rememberSelection, runCloseAction],
  );

  const handleCloseRequested = useCallback(
    (event: { preventDefault: () => void }) => {
      event.preventDefault();
      const plan = resolveDesktopCloseRequestPlan(
        desktopCloseButtonActionRef.current,
      );
      if (plan === "PROMPT") {
        setRememberSelection(false);
        setDialogOpen(true);
        return;
      }
      void runCloseAction(plan).catch(() => {
        setRememberSelection(false);
        setDialogOpen(true);
      });
    },
    [runCloseAction],
  );

  useEffect(() => {
    let disposed = false;
    let cleanup: () => void = () => undefined;
    void api
      .subscribeDesktopMainWindowCloseRequested(handleCloseRequested)
      .then((unlisten) => {
        if (disposed) {
          unlisten();
          return;
        }
        cleanup = unlisten;
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      cleanup();
    };
  }, [handleCloseRequested]);

  return (
    <AppModal
      open={dialogOpen}
      onClose={handleDialogClose}
      preset="alert"
      className="desktop-close-behavior-modal"
      closeOnInteractOutside={false}
      closeOnEscapeKeyDown={!pendingAction}
      accessibilityTitle={t("desktop.closeDialog.title")}
      accessibilityDescription={t("desktop.closeDialog.description")}
    >
      <StandardModalFrame
        variant="alert"
        title={t("desktop.closeDialog.title")}
        description={t("desktop.closeDialog.description")}
        actions={
          <div className="ui-standard-modal-action-group">
            <Button
              variant="secondary"
              onClick={() => handleCloseChoice("QUIT")}
              loading={pendingAction === "QUIT"}
              disabled={Boolean(pendingAction)}
            >
              {t("desktop.closeDialog.quit")}
            </Button>
            <Button
              variant="default"
              onClick={() => handleCloseChoice("MINIMIZE_TO_TRAY")}
              loading={pendingAction === "MINIMIZE_TO_TRAY"}
              disabled={Boolean(pendingAction)}
              autoFocus
            >
              {t("desktop.closeDialog.minimizeToTray")}
            </Button>
          </div>
        }
      >
        <label className="flex items-center gap-2 text-r2 text-[color:var(--text)]">
          <Checkbox
            checked={rememberSelection}
            onChange={(event) => setRememberSelection(event.target.checked)}
            disabled={Boolean(pendingAction) || !canPersistUiSettings}
          />
          <span>{t("desktop.closeDialog.rememberChoice")}</span>
        </label>
      </StandardModalFrame>
    </AppModal>
  );
};

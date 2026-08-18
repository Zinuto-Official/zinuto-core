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
  writeCachedAppUiSettingsSnapshot,
} from "@/app-shell/appPreferencesModel";
import {
  resolveDesktopCloseRequestPlan,
  type DesktopCloseRequestPlan,
} from "@/frontend-kernel/windowBehavior";
import type {
  UiSettings,
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
  requestId: string,
): Promise<void> => {
  if (plan === "QUIT") {
    await api.quitDesktopApp();
    return;
  }
  await api.resolveDesktopMainWindowCloseRequest(
    requestId,
    "MINIMIZE_TO_TRAY",
  );
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
  const [activeCloseRequestId, setActiveCloseRequestId] = useState<string | null>(
    null,
  );
  const desktopCloseButtonActionRef = useRef(desktopCloseButtonAction);
  const isExecutingCloseActionRef = useRef(false);
  const activeCloseRequestIdRef = useRef<string | null>(null);

  useEffect(() => {
    desktopCloseButtonActionRef.current = desktopCloseButtonAction;
  }, [desktopCloseButtonAction]);

  const rememberCloseAction = useCallback(
    (action: CloseExecutionAction) => {
      if (!canPersistUiSettings) {
        return;
      }
      setDesktopCloseButtonAction(action);
      let nextSettings: UiSettings;
      try {
        nextSettings = buildUiSettingsWithDesktopCloseButtonAction(
          buildUiSettings(),
          action,
        );
      } catch {
        // Remembering a choice is best-effort. The in-memory setting above
        // still takes effect for this session, and the close action must keep
        // going even if startup state is not ready to be serialized.
        return;
      }
      try {
        writeCachedAppUiSettingsSnapshot(nextSettings);
      } catch {
        // A broken local cache must never turn a close click into a disabled
        // modal. The backend write below remains best-effort as well.
      }
      // The local cache is the immediate durable intent. The backend write is
      // deliberately best-effort because quit must not wait for IPC/runtime
      // cleanup; startup recovery will rebase this cached setting if needed.
      void api
        .updateAppUiSettings(nextSettings as Record<string, unknown>)
        .catch(() => undefined);
    },
    [buildUiSettings, canPersistUiSettings, setDesktopCloseButtonAction],
  );

  const clearActiveCloseRequest = useCallback((requestId: string) => {
    if (activeCloseRequestIdRef.current !== requestId) {
      return;
    }
    activeCloseRequestIdRef.current = null;
    setActiveCloseRequestId(null);
  }, []);

  const commitCloseAction = useCallback(
    (action: CloseExecutionAction, requestId: string, remember: boolean) => {
      if (isExecutingCloseActionRef.current) {
        return;
      }
      isExecutingCloseActionRef.current = true;
      setPendingAction(action);
      setDialogOpen(false);
      if (remember) {
        rememberCloseAction(action);
      }

      void executeDesktopClosePlan(action, requestId)
        .then(() => {
          clearActiveCloseRequest(requestId);
        })
        .catch(() => {
          // A native quit command is expected to be fire-and-forget. If it
          // really failed, restore a usable prompt rather than leaving the
          // action button permanently disabled.
          setRememberSelection(false);
          setDialogOpen(true);
        })
        .finally(() => {
          isExecutingCloseActionRef.current = false;
          setPendingAction(null);
        });
    },
    [clearActiveCloseRequest, rememberCloseAction],
  );

  const handleDialogClose = useCallback(() => {
    if (pendingAction) {
      return;
    }
    setDialogOpen(false);
    setRememberSelection(false);
    const requestId = activeCloseRequestIdRef.current;
    if (!requestId) {
      return;
    }
    void api
      .resolveDesktopMainWindowCloseRequest(requestId, "CANCEL")
      .then(() => {
        clearActiveCloseRequest(requestId);
      })
      .catch(() => {
        // Keep the native lease alive and restore the prompt if the cancel
        // acknowledgement itself could not cross the bridge.
        setDialogOpen(true);
      });
  }, [clearActiveCloseRequest, pendingAction]);

  const handleCloseChoice = useCallback(
    (action: CloseExecutionAction) => {
      const requestId = activeCloseRequestIdRef.current;
      if (!requestId) {
        return;
      }
      commitCloseAction(action, requestId, rememberSelection);
    },
    [commitCloseAction, rememberSelection],
  );

  const handleCloseRequested = useCallback(
    ({ requestId }: { requestId: string }) => {
      if (activeCloseRequestIdRef.current === requestId) {
        void api
          .keepaliveDesktopMainWindowCloseRequest(requestId)
          .catch(() => undefined);
        return;
      }
      activeCloseRequestIdRef.current = requestId;
      setActiveCloseRequestId(requestId);
      void api
        .acknowledgeDesktopMainWindowCloseRequest(requestId)
        .catch(() => undefined);
      const plan = resolveDesktopCloseRequestPlan(
        desktopCloseButtonActionRef.current,
      );
      if (plan === "PROMPT") {
        setRememberSelection(false);
        setDialogOpen(true);
        return;
      }
      commitCloseAction(plan, requestId, false);
    },
    [commitCloseAction],
  );

  useEffect(() => {
    let disposed = false;
    let cleanup: () => void = () => undefined;
    let stopHeartbeat: () => void = () => undefined;
    void (async () => {
      try {
        const unlisten =
          await api.subscribeDesktopMainWindowCloseRequested(
            handleCloseRequested,
          );
        if (disposed) {
          unlisten();
          return;
        }
        cleanup = unlisten;
        await api.setDesktopMainWindowCloseHandlerStatus(true);
        if (disposed) {
          return;
        }
        const heartbeatTimer = window.setInterval(() => {
          void api
            .setDesktopMainWindowCloseHandlerStatus(true)
            .catch(() => undefined);
        }, 2_000);
        stopHeartbeat = () => window.clearInterval(heartbeatTimer);
      } catch {
        // The native arbiter deliberately treats an unregistered handler as
        // a safe direct-quit fallback.
      }
    })();
    return () => {
      disposed = true;
      stopHeartbeat();
      cleanup();
      void api
        .setDesktopMainWindowCloseHandlerStatus(false)
        .catch(() => undefined);
    };
  }, [handleCloseRequested]);

  useEffect(() => {
    if (!activeCloseRequestId) {
      return () => undefined;
    }
    const keepalive = () => {
      void api
        .keepaliveDesktopMainWindowCloseRequest(activeCloseRequestId)
        .catch(() => undefined);
    };
    keepalive();
    const keepaliveTimer = window.setInterval(keepalive, 1_000);
    return () => window.clearInterval(keepaliveTimer);
  }, [activeCloseRequestId]);

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

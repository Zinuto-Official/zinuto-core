// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  isRetryableBackendTransportError,
  type ApiHistoryRetentionImpact,
  type ApiHistoryRetentionJob,
  type ApiHistoryRetentionPolicy,
  type ApiHistoryRetentionPreview,
  type ApiHistoryRetentionTargets,
  type ApiHistoryRetentionWindow,
} from "@/api";
import type { AppTextKey } from "@/frontend-kernel/i18n/messageRuntime";
import { Checkbox } from "@/ui/primitives/checkbox";
import { SelectField } from "@/ui/primitives/select-field";
import { Button } from "@/ui/primitives/button";
import { WorkspaceSection } from "@/ui/components";
import { formatDotJoinedText } from "@/ui/formatting/i18nDisplay";
import { pollHistoryRetentionJobUntilTerminal } from "./historyRetentionJobPolling";

type UiLanguage = "en" | "zh-CN" | "ja" | "ko" | "es";

const HISTORY_RETENTION_WINDOW_OPTIONS: ApiHistoryRetentionWindow[] = [
  "ONE_MONTH",
  "SIX_MONTHS",
  "ONE_YEAR",
  "THREE_YEARS",
  "FOREVER",
];

const HISTORY_RETENTION_TARGET_KEYS: Array<keyof ApiHistoryRetentionTargets> = [
  "freeReplayDetails",
  "challengeDetails",
  "noteText",
];

const HISTORY_RETENTION_TARGET_COPY_KEYS = {
  freeReplayDetails: {
    label: "settings.storage.historyRetention.targets.freeReplayDetails.label",
    description:
      "settings.storage.historyRetention.targets.freeReplayDetails.description",
  },
  challengeDetails: {
    label: "settings.storage.historyRetention.targets.challengeDetails.label",
    description:
      "settings.storage.historyRetention.targets.challengeDetails.description",
  },
  noteText: {
    label: "settings.storage.historyRetention.targets.noteText.label",
    description:
      "settings.storage.historyRetention.targets.noteText.description",
  },
} satisfies Record<
  keyof ApiHistoryRetentionTargets,
  { label: string; description: string }
>;

const DEFAULT_HISTORY_RETENTION_TARGETS: ApiHistoryRetentionTargets = {
  freeReplayDetails: true,
  challengeDetails: true,
  noteText: false,
};

const buildDefaultHistoryRetentionPolicy = (): ApiHistoryRetentionPolicy => ({
  retentionWindow: "ONE_YEAR",
  targets: DEFAULT_HISTORY_RETENTION_TARGETS,
  updatedAt: new Date().toISOString(),
  lastAppliedAt: null,
});

const formatHistoryRetentionImpact = (
  impact: ApiHistoryRetentionImpact | undefined,
  language: UiLanguage,
  formatStorageBytes: (value: number) => string,
): string => {
  const rows = Math.max(0, Math.floor(Number(impact?.rows ?? 0)));
  const bytes = Math.max(0, Math.floor(Number(impact?.bytes ?? 0)));
  return formatDotJoinedText(language, [
    new Intl.NumberFormat(language).format(rows),
    formatStorageBytes(bytes),
  ]);
};

const resolveHistoryRetentionJobStatusText = (
  job: ApiHistoryRetentionJob | null,
  t: (key: string) => string,
): string => {
  if (!job) {
    return t("settings.storage.historyRetention.job.none");
  }
  if (job.status === "SUCCESS") {
    return t("settings.storage.historyRetention.job.success");
  }
  if (job.status === "FAILED") {
    return t("settings.storage.historyRetention.job.failed");
  }
  if (job.status === "QUEUED") {
    return t("settings.storage.historyRetention.job.queued");
  }
  return t("settings.storage.historyRetention.job.running");
};

export type SystemHistoryRetentionSettingsProps = {
  isActive: boolean;
  disabled: boolean;
  actionModel: {
    saveEnabled: boolean;
    previewEnabled: boolean;
    startEnabled: boolean;
  };
  language: UiLanguage;
  formatStorageBytes: (value: number) => string;
  refreshSystemStorageUsage: (options?: { silent?: boolean }) => Promise<void>;
  onHistoryRetentionApplied?: (job: ApiHistoryRetentionJob) => void | Promise<void>;
  t: (key: string, params?: Record<string, string | number>) => string;
  tt: (key: AppTextKey) => string;
};

export const SystemHistoryRetentionSettings = ({
  isActive,
  disabled,
  actionModel,
  language,
  formatStorageBytes,
  refreshSystemStorageUsage,
  onHistoryRetentionApplied,
  t,
  tt,
}: SystemHistoryRetentionSettingsProps) => {
  const [policy, setPolicy] = useState<ApiHistoryRetentionPolicy>(
    buildDefaultHistoryRetentionPolicy,
  );
  const [draftWindow, setDraftWindow] =
    useState<ApiHistoryRetentionWindow>("ONE_YEAR");
  const [draftTargets, setDraftTargets] = useState<ApiHistoryRetentionTargets>(
    DEFAULT_HISTORY_RETENTION_TARGETS,
  );
  const [preview, setPreview] = useState<ApiHistoryRetentionPreview | null>(
    null,
  );
  const [latestJob, setLatestJob] = useState<ApiHistoryRetentionJob | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [pollingFailed, setPollingFailed] = useState(false);
  const [pollingRevision, setPollingRevision] = useState(0);
  const appliedRetentionJobIdsRef = useRef(new Set<string>());

  const isJobActive =
    latestJob?.status === "QUEUED" || latestJob?.status === "RUNNING";
  const isDirty =
    draftWindow !== policy.retentionWindow ||
    HISTORY_RETENTION_TARGET_KEYS.some(
      (key) => draftTargets[key] !== policy.targets[key],
    );
  const actionDisabled =
    disabled ||
    isLoading ||
    isSaving ||
    isPreviewing ||
    isStarting ||
    isJobActive;
  const saveDisabled = actionDisabled || !actionModel.saveEnabled;
  const previewDisabled = actionDisabled || !actionModel.previewEnabled;
  const startDisabled = actionDisabled || !actionModel.startEnabled;

  const loadRetentionState = useMemo(
    () => async () => {
      setIsLoading(true);
      try {
        const [nextPolicy, nextJob] = await Promise.all([
          api.getHistoryRetentionPolicy(),
          api.getLatestHistoryRetentionJob(),
        ]);
        setPolicy(nextPolicy);
        setDraftWindow(nextPolicy.retentionWindow);
        setDraftTargets(nextPolicy.targets);
        setLatestJob(nextJob);
        setPollingFailed(false);
        setFeedbackText("");
      } catch {
        setFeedbackText(
          t("settings.storage.historyRetention.feedback.loadFailed"),
        );
      } finally {
        setIsLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    if (!isActive) {
      return;
    }
    void loadRetentionState();
  }, [isActive, loadRetentionState]);

  useEffect(() => {
    const monitoredJob = latestJob;
    if (!isActive || !monitoredJob || !isJobActive) {
      return;
    }
    const abortController = new AbortController();
    void pollHistoryRetentionJobUntilTerminal({
      initialJob: monitoredJob,
      signal: abortController.signal,
      loadJob: (jobId, options) => api.getHistoryRetentionJob(jobId, options),
      isRetryableError: isRetryableBackendTransportError,
      onFailure: ({ willRetry }) => {
        setFeedbackText(
          t("settings.storage.historyRetention.feedback.loadFailed"),
        );
        setPollingFailed(!willRetry);
      },
      onJob: (job) => {
        setLatestJob(job);
        setPollingFailed(false);
        setFeedbackText("");
        if (job.status === "SUCCESS") {
          void refreshSystemStorageUsage({ silent: true });
          const jobId = String(job.id || "").trim();
          if (jobId && !appliedRetentionJobIdsRef.current.has(jobId)) {
            appliedRetentionJobIdsRef.current.add(jobId);
            void Promise.resolve(onHistoryRetentionApplied?.(job)).catch(
              () => undefined,
            );
          }
        }
      },
    }).catch(() => {
      if (!abortController.signal.aborted) {
        setFeedbackText(
          t("settings.storage.historyRetention.feedback.loadFailed"),
        );
        setPollingFailed(true);
      }
    });
    return () => abortController.abort();
  }, [
    isActive,
    isJobActive,
    latestJob?.id,
    onHistoryRetentionApplied,
    pollingRevision,
    refreshSystemStorageUsage,
    t,
  ]);

  const savePolicy = async (): Promise<ApiHistoryRetentionPolicy | null> => {
    setIsSaving(true);
    try {
      const saved = await api.updateHistoryRetentionPolicy({
        retentionWindow: draftWindow,
        targets: draftTargets,
      });
      setPolicy(saved);
      setDraftWindow(saved.retentionWindow);
      setDraftTargets(saved.targets);
      setFeedbackText(t("settings.storage.historyRetention.feedback.saved"));
      return saved;
    } catch {
      setFeedbackText(
        t("settings.storage.historyRetention.feedback.saveFailed"),
      );
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  const previewPolicy = async () => {
    setIsPreviewing(true);
    try {
      const nextPreview = await api.previewHistoryRetentionPolicy({
        retentionWindow: draftWindow,
        targets: draftTargets,
      });
      setPreview(nextPreview);
      setFeedbackText(
        t("settings.storage.historyRetention.feedback.previewReady"),
      );
    } catch {
      setFeedbackText(
        t("settings.storage.historyRetention.feedback.previewFailed"),
      );
    } finally {
      setIsPreviewing(false);
    }
  };

  const startCleanup = async () => {
    setIsStarting(true);
    try {
      const saved = isDirty ? await savePolicy() : policy;
      if (!saved) {
        return;
      }
      const job = await api.startHistoryRetentionJob();
      setLatestJob(job);
      setPollingFailed(false);
      setFeedbackText(t("settings.storage.historyRetention.feedback.started"));
    } catch {
      setFeedbackText(
        t("settings.storage.historyRetention.feedback.startFailed"),
      );
    } finally {
      setIsStarting(false);
    }
  };

  const targetOptions = HISTORY_RETENTION_TARGET_KEYS.map((key) => ({
    key,
    label: t(HISTORY_RETENTION_TARGET_COPY_KEYS[key].label),
    description: t(HISTORY_RETENTION_TARGET_COPY_KEYS[key].description),
  }));
  const visiblePreview = preview ?? latestJob?.result ?? null;
  const latestDeleted = latestJob?.result?.deleted ?? null;
  const retentionWarningText = formatDotJoinedText(language, [
    t("settings.storage.historyRetention.warning"),
    draftTargets.noteText
      ? t("settings.storage.historyRetention.noteTextWarning")
      : "",
  ]);

  return (
    <WorkspaceSection
      title={t("settings.storage.historyRetention.section")}
      className="settings-flow-group"
      bodyClassName="settings-flow-row-list"
    >
      <div className="settings-action-panel settings-retention-panel">
        <div className="settings-retention-policy-head">
          <div className="settings-retention-policy-copy">
            <strong className="settings-retention-panel-title">
              {t("settings.storage.historyRetention.title")}
            </strong>
            <span className="settings-action-panel-note">
              {t("settings.storage.historyRetention.description")}
            </span>
          </div>
          <div className="settings-retention-command-column">
            <div className="settings-retention-command-row">
              <div
                className="settings-retention-window-inline"
                title={t("settings.storage.historyRetention.window.description")}
              >
                <span className="settings-retention-window-label">
                  {t("settings.storage.historyRetention.window.title")}
                </span>
                <SelectField
                  className="settings-retention-window-select"
                  aria-label={t("settings.storage.historyRetention.window.title")}
                  density="compact"
                  width="fit"
                  value={draftWindow}
                  disabled={actionDisabled}
                  onValueChange={(nextValue) =>
                    setDraftWindow(nextValue as ApiHistoryRetentionWindow)
                  }
                  options={HISTORY_RETENTION_WINDOW_OPTIONS.map((windowValue) => ({
                    value: windowValue,
                    label: t(
                      `settings.storage.historyRetention.window.${windowValue}`,
                    ),
                  }))}
                />
              </div>
              <div className="settings-inline-action-row settings-retention-action-row">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void savePolicy()}
                  disabled={saveDisabled || !isDirty}
                  loading={isSaving}
                  loadingLabel={tt("appText.save")}
                >
                  {tt("appText.save")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void previewPolicy()}
                  disabled={previewDisabled}
                  loading={isPreviewing}
                  loadingLabel={t("settings.storage.historyRetention.preview")}
                >
                  {t("settings.storage.historyRetention.preview")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void startCleanup()}
                  disabled={startDisabled}
                  loading={isStarting || isJobActive}
                  loadingLabel={t("settings.storage.historyRetention.applyNow")}
                >
                  {t("settings.storage.historyRetention.applyNow")}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="settings-retention-targets-section">
          <div className="settings-retention-subsection-head">
            <strong>{t("settings.storage.historyRetention.targets.title")}</strong>
            <span className="settings-action-panel-note">
              {retentionWarningText}
            </span>
          </div>

          <div className="settings-retention-target-grid">
            {targetOptions.map((option) => (
              <label
                key={option.key}
                className={`settings-retention-target-card ${
                  option.key === "noteText" ? "is-risk" : ""
                }`}
                title={option.description}
              >
                <Checkbox
                  checked={draftTargets[option.key]}
                  disabled={actionDisabled}
                  onChange={(event) =>
                    setDraftTargets((current) => ({
                      ...current,
                      [option.key]: event.target.checked,
                    }))
                  }
                />
                <span className="settings-retention-target-copy">
                  <span className="settings-retention-target-label">
                    {option.label}
                  </span>
                  <span className="settings-retention-target-description">
                    {option.description}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="settings-retention-output-grid">
          {visiblePreview ? (
            <div className="settings-retention-result-panel">
              <div className="settings-retention-result-head">
                <strong>{t("settings.storage.historyRetention.preview")}</strong>
              </div>
              <div className="settings-action-panel-stats">
                <span>
                  {t("settings.storage.historyRetention.cutoff", {
                    value: visiblePreview.cutoffAt
                      ? visiblePreview.cutoffAt.slice(0, 10)
                      : t("settings.storage.historyRetention.foreverCutoff"),
                  })}
                </span>
                {HISTORY_RETENTION_TARGET_KEYS.map((key) => (
                  <span key={key}>
                    {`${t(HISTORY_RETENTION_TARGET_COPY_KEYS[key].label)} ${formatHistoryRetentionImpact(
                      visiblePreview.estimated[key],
                      language,
                      formatStorageBytes,
                    )}`}
                  </span>
                ))}
                {latestDeleted ? (
                  <span>
                    {t("settings.storage.historyRetention.deletedSummary", {
                      value: formatHistoryRetentionImpact(
                        {
                          rows: latestDeleted.totalRows,
                          bytes: latestDeleted.totalBytes,
                        },
                        language,
                        formatStorageBytes,
                      ),
                    })}
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="settings-retention-result-panel">
            <div className="settings-retention-result-head">
              <strong>{tt("appText.cleanupJobProgress")}</strong>
            </div>
            <div className="settings-action-panel-status">
              <div className="settings-action-panel-status-head">
                <span>{resolveHistoryRetentionJobStatusText(latestJob, t)}</span>
                <strong>{`${Math.max(
                  0,
                  Math.min(100, Math.round(latestJob?.progressPercent ?? 0)),
                )}${tt("appText.percent")}`}</strong>
              </div>
              {isJobActive ? (
                <div className="settings-action-panel-track">
                  <span
                    style={{
                      width: `${Math.max(
                        0,
                        Math.min(100, latestJob?.progressPercent ?? 0),
                      )}%`,
                    }}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {feedbackText ? (
          <div className="settings-inline-action-row">
            <span className="settings-action-panel-hint">{feedbackText}</span>
            {pollingFailed && isJobActive ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPollingFailed(false);
                  setPollingRevision((current) => current + 1);
                }}
              >
                {tt("appText.retry")}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </WorkspaceSection>
  );
};

// SPDX-License-Identifier: GPL-3.0-only

import type { ApiSystemDevSimulationJob } from "@/api";
import type { AppTextKey } from "@/frontend-kernel/i18n/messageRuntime";
import { Button } from "@/ui/primitives/button";
import { Checkbox } from "@/ui/primitives/checkbox";
import { Input } from "@/ui/primitives/input";
import { SegmentedControl } from "@/ui/primitives/segmented-control";
import { PlainTabBar, WorkspaceSection } from "@/ui/components";
import type { useSystemDevSimulationControl } from "@/workspaces/settings/useSystemDevSimulationControl";

type SystemDevSimulationTargets = {
  freeReplayTarget: number;
  fastDecisionTarget: number;
  riskDisciplineTarget: number;
  independentCustomNotes: number;
  customIndicatorProfiles: number;
  realBacktestBatches: number;
};

type SystemDevSimulationCleanupStage =
  | "QUEUED"
  | "COLLECTING"
  | "REPLAY_NOTES"
  | "QUESTION_LEDGER"
  | "SPECIAL_TRAINING_HISTORY"
  | "TRAINING_PROJECTS"
  | "CUSTOM_INDICATORS"
  | "BACKTESTS"
  | "FINALIZING"
  | "DONE";

type SystemDevSimulationControl = ReturnType<
  typeof useSystemDevSimulationControl
>;

type SystemSettingsDeveloperSimulationSectionProps = {
  visible: boolean;
  disabled: boolean;
  tt: (key: AppTextKey) => string;
  t: (key: string) => string;
  devSimulation: SystemDevSimulationControl;
  hasSimulationTargets: boolean;
  simulationProfileId: "REALISTIC" | "STRESS";
  visibleSimulationProfileOptions: Array<{
    key: "REALISTIC" | "STRESS";
    label: string;
    description: string;
  }>;
  simulationRepeatMode: "REPLACE" | "APPEND";
  simulationSeed: string;
  simulationTargets: SystemDevSimulationTargets;
  onSimulationProfileChange: (profileId: "REALISTIC" | "STRESS") => void;
  onSimulationRepeatModeChange: (repeatMode: "REPLACE" | "APPEND") => void;
  onSimulationSeedChange: (seed: string) => void;
  onSimulationTargetChange: (
    key: keyof SystemDevSimulationTargets,
    value: number,
  ) => void;
  onClearSimulationTargets: () => void;
  onRestoreSimulationPreset: () => void;
  simulationPresetTargets: Record<
    "REALISTIC" | "STRESS",
    SystemDevSimulationTargets
  >;
};

const resolveSimulationCleanupStageText = (
  stage: SystemDevSimulationCleanupStage,
  tt: (key: AppTextKey) => string,
): string => {
  switch (stage) {
    case "QUEUED":
      return tt("appText.cleanupQueued");
    case "COLLECTING":
      return tt("appText.collectingCleanupScope");
    case "REPLAY_NOTES":
    case "QUESTION_LEDGER":
      return tt("appText.clearingSimulationNotesLedgerRecords");
    case "SPECIAL_TRAINING_HISTORY":
      return tt("appText.clearingSpecialTrainingHistory");
    case "TRAINING_PROJECTS":
      return tt("appText.clearingFreeReplayArchives");
    case "CUSTOM_INDICATORS":
    case "BACKTESTS":
    case "FINALIZING":
      return tt("appText.finalizingLocalCaches");
    case "DONE":
      return tt("appText.cleanupCompleted");
    default:
      return tt("appText.calculating");
  }
};

const resolveSimulationJobStatusText = (
  job: ApiSystemDevSimulationJob,
  tt: (key: AppTextKey) => string,
): string => {
  if (job.status === "FAILED") return job.currentMessage || tt("appText.error");
  if (job.status === "INTERRUPTED") return tt("appText.cancel");
  if (job.status === "SUCCESS") return tt("appText.done");
  return job.currentMessage || tt("appText.simulationJobProgress");
};

const formatPercent = (value: number, tt: (key: AppTextKey) => string) =>
  `${Math.max(0, Math.min(100, Math.round(value)))}${tt("appText.percent")}`;

export function SystemSettingsDeveloperSimulationSection({
  visible,
  disabled,
  tt,
  t,
  devSimulation,
  hasSimulationTargets,
  simulationProfileId,
  visibleSimulationProfileOptions,
  simulationRepeatMode,
  simulationSeed,
  simulationTargets,
  onSimulationProfileChange,
  onSimulationRepeatModeChange,
  onSimulationSeedChange,
  onSimulationTargetChange,
  onClearSimulationTargets,
  onRestoreSimulationPreset,
  simulationPresetTargets,
}: SystemSettingsDeveloperSimulationSectionProps) {
  if (!visible) return null;

  const targetEntries: Array<[keyof SystemDevSimulationTargets, string]> = [
    ["freeReplayTarget", tt("appText.freeReplay")],
    ["fastDecisionTarget", tt("appText.fastDecision")],
    ["riskDisciplineTarget", tt("appText.riskDiscipline")],
    ["independentCustomNotes", t("settings.devSimulation.targets.customNotes")],
    [
      "customIndicatorProfiles",
      t("settings.devSimulation.targets.customIndicators"),
    ],
    ["realBacktestBatches", t("settings.devSimulation.targets.realBacktests")],
  ];
  const activeProfile = visibleSimulationProfileOptions.find(
    (option) => option.key === simulationProfileId,
  );
  const startDisabled =
    disabled ||
    devSimulation.isStarting ||
    devSimulation.isCleaning ||
    !devSimulation.canStart ||
    !hasSimulationTargets ||
    !simulationSeed.trim();

  return (
    <WorkspaceSection
      className="settings-flow-group settings-simulation-section"
      bodyClassName="settings-simulation-workbench"
    >
      <header className="settings-simulation-hero">
        <div className="settings-simulation-hero-copy">
          <span className="settings-simulation-eyebrow">
            {t("settings.devSimulation.dataSelection.title")}
          </span>
          <h3>{tt("appText.simulationSeedData")}</h3>
          <p>{t("settings.storage.devSimulation.description")}</p>
          <div className="settings-simulation-source-note">
            <span
              className="settings-simulation-source-dot"
              aria-hidden="true"
            />
            <span>
              <strong>
                {t("settings.devSimulation.dataSelection.action")}
              </strong>
              <small>
                {t("settings.devSimulation.dataSelection.description")}
              </small>
            </span>
          </div>
        </div>
        <div className="settings-simulation-hero-actions">
          <Button
            variant="default"
            onClick={() => void devSimulation.start()}
            disabled={startDisabled}
            loading={devSimulation.isStarting}
            loadingLabel={tt("appText.generateData")}
          >
            {tt("appText.generateData")}
          </Button>
          <Button
            variant="secondary"
            onClick={() => void devSimulation.cleanup()}
            disabled={
              disabled ||
              devSimulation.isStarting ||
              devSimulation.isCleaning ||
              !devSimulation.cleanupAction.enabled
            }
            loading={devSimulation.isCleaning}
            loadingLabel={tt("appText.clearSimulationData")}
          >
            {tt("appText.clearSimulationData")}
          </Button>
          {devSimulation.cancelAction.enabled ? (
            <Button
              variant="outline"
              onClick={() => void devSimulation.cancel()}
              disabled={
                disabled ||
                devSimulation.isCleaning ||
                !devSimulation.cancelAction.enabled
              }
            >
              {tt("appText.cancel")}
            </Button>
          ) : null}
        </div>
      </header>

      <div className="settings-simulation-config-grid">
        <section className="settings-simulation-card settings-simulation-profile-card">
          <div className="settings-simulation-card-head">
            <div>
              <span className="settings-simulation-card-kicker">
                {t("settings.devSimulation.profile.title")}
              </span>
              <strong>{activeProfile?.label ?? ""}</strong>
            </div>
          </div>
          <div className="settings-simulation-profile-body">
            <PlainTabBar
              value={simulationProfileId}
              items={visibleSimulationProfileOptions.map((option) => ({
                key: option.key,
                label: option.label,
              }))}
              onChange={(value) =>
                onSimulationProfileChange(value as "REALISTIC" | "STRESS")
              }
              ariaLabel={t("settings.devSimulation.profile.title")}
              className="settings-simulation-profile-tabbar"
              itemClassName="settings-simulation-profile-tab"
            />
            <p>{activeProfile?.description ?? ""}</p>
            {simulationProfileId === "STRESS" ? (
              <span className="settings-simulation-warning">
                {t("settings.devSimulation.profile.stressWarning")}
              </span>
            ) : null}
          </div>
        </section>

        <section className="settings-simulation-card settings-simulation-controls-card">
          <div className="settings-simulation-field">
            <span className="settings-simulation-field-label">
              {t("settings.devSimulation.controls.repeatMode")}
            </span>
            <SegmentedControl
              value={simulationRepeatMode}
              options={[
                { value: "REPLACE", label: t("settings.devSimulation.controls.replace") },
                { value: "APPEND", label: t("settings.devSimulation.controls.append") },
              ]}
              onChange={(value) =>
                onSimulationRepeatModeChange(value as "REPLACE" | "APPEND")
              }
              className="settings-simulation-repeat-mode"
            />
            <small>
              {simulationRepeatMode === "REPLACE"
                ? t("settings.devSimulation.controls.replace")
                : t("settings.devSimulation.controls.append")}
            </small>
          </div>
          <label
            className="settings-simulation-field"
            htmlFor="settings-simulation-seed"
          >
            <span className="settings-simulation-field-label">
              {t("settings.devSimulation.controls.seed")}
            </span>
            <Input
              id="settings-simulation-seed"
              className="settings-simulation-seed"
              value={simulationSeed}
              maxLength={128}
              onChange={(event) => onSimulationSeedChange(event.target.value)}
              aria-label={t("settings.devSimulation.controls.seed")}
            />
          </label>
        </section>
      </div>

      <section className="settings-simulation-card settings-simulation-targets-card">
        <div className="settings-simulation-card-head settings-simulation-targets-head">
          <div>
            <span className="settings-simulation-card-kicker">
              {t("settings.devSimulation.targets.title")}
            </span>
            <strong>{activeProfile?.label ?? ""}</strong>
          </div>
          <div className="settings-simulation-target-actions">
            <Button
              variant="ghost"
              size="xs"
              onClick={onClearSimulationTargets}
            >
              {t("settings.devSimulation.controls.clearAll")}
            </Button>
            <Button
              variant="secondary"
              size="xs"
              onClick={onRestoreSimulationPreset}
            >
              {t("settings.devSimulation.controls.restorePreset")}
            </Button>
          </div>
        </div>
        <div className="settings-simulation-target-grid">
          {targetEntries.map(([key, label]) => (
            <label
              className={`settings-simulation-target ${simulationTargets[key] > 0 ? "is-selected" : ""}`}
              key={key}
            >
              <span className="settings-simulation-target-label">
                <Checkbox
                  checked={simulationTargets[key] > 0}
                  onChange={(event) =>
                    onSimulationTargetChange(
                      key,
                      event.target.checked
                        ? simulationPresetTargets[simulationProfileId][key]
                        : 0,
                    )
                  }
                />
                <span>{label}</span>
              </span>
              <Input
                className="settings-simulation-target-input"
                type="number"
                min={0}
                value={simulationTargets[key]}
                onChange={(event) =>
                  onSimulationTargetChange(key, Number(event.target.value))
                }
                aria-label={label}
              />
            </label>
          ))}
        </div>
      </section>

      {devSimulation.disabledReason || devSimulation.feedbackText ? (
        <div
          className={`settings-simulation-feedback ${devSimulation.feedbackTone === "error" ? "is-error" : devSimulation.feedbackTone === "success" ? "is-success" : ""}`}
          role={devSimulation.feedbackTone === "error" ? "alert" : "status"}
        >
          {devSimulation.disabledReason ? (
            <span>{devSimulation.disabledReason}</span>
          ) : null}
          {devSimulation.feedbackText ? (
            <span>{devSimulation.feedbackText}</span>
          ) : null}
        </div>
      ) : null}

      {devSimulation.visibleCleanupJob ? (
        <section className="settings-simulation-status" aria-live="polite">
          <div className="settings-simulation-status-head">
            <span>{tt("appText.latestCleanupJob")}</span>
            <strong>
              {formatPercent(
                devSimulation.visibleCleanupJob.progressPercent,
                tt,
              )}
            </strong>
          </div>
          <span className="settings-simulation-phase">
            {tt("appText.cleanupJobProgress")}
          </span>
          <div
            className="settings-simulation-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.max(
              0,
              Math.min(
                100,
                devSimulation.visibleCleanupJob.progressPercent,
              ),
            )}
          >
            <span
              style={{
                width: `${Math.max(0, Math.min(100, devSimulation.visibleCleanupJob.progressPercent))}%`,
              }}
            />
          </div>
          <div className="settings-simulation-stats">
            <span>
              {resolveSimulationCleanupStageText(
                devSimulation.visibleCleanupJob.stage,
                tt,
              )}
            </span>
          </div>
        </section>
      ) : devSimulation.visibleJob ? (
        <section className="settings-simulation-status" aria-live="polite">
          <div className="settings-simulation-status-head">
            <span>{tt("appText.latestSimulationJob")}</span>
            <strong>
              {formatPercent(devSimulation.visibleJob.progressPercent, tt)}
            </strong>
          </div>
          <span className="settings-simulation-phase">
            {resolveSimulationJobStatusText(devSimulation.visibleJob, tt)}
          </span>
          <div
            className="settings-simulation-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.max(
              0,
              Math.min(100, devSimulation.visibleJob.progressPercent),
            )}
          >
            <span
              style={{
                width: `${Math.max(0, Math.min(100, devSimulation.visibleJob.progressPercent))}%`,
              }}
            />
          </div>
          <div className="settings-simulation-stats">
            {devSimulation.visibleJobDiagnosticText ? (
              <span>{devSimulation.visibleJobDiagnosticText}</span>
            ) : null}
            {devSimulation.visibleJobCurrentWorkloadText ? (
              <span>{devSimulation.visibleJobCurrentWorkloadText}</span>
            ) : null}
            <span>
              {`${tt("appText.freeReplay")} ${devSimulation.visibleJob.freeReplayCompleted}/${devSimulation.visibleJobDisplayTargets?.freeReplayTarget ?? devSimulation.visibleJob.freeReplayTarget}`}
            </span>
            <span>
              {`${tt("appText.fastDecision")} ${devSimulation.visibleJob.fastDecisionCompleted}/${devSimulation.visibleJobDisplayTargets?.fastDecisionTarget ?? devSimulation.visibleJob.fastDecisionTarget}`}
            </span>
            <span>
              {`${tt("appText.riskDiscipline")} ${devSimulation.visibleJob.riskDisciplineCompleted}/${devSimulation.visibleJobDisplayTargets?.riskDisciplineTarget ?? devSimulation.visibleJob.riskDisciplineTarget}`}
            </span>
            <span>
              {`${t("settings.devSimulation.status.customNotes")} ${devSimulation.visibleJob.createdCounts.independentCustomNotes}/${devSimulation.visibleJobDisplayTargets?.independentCustomNotesTarget ?? devSimulation.visibleJob.effectivePlan?.targets.independentCustomNotes ?? 0}`}
            </span>
            <span>
              {`${t("settings.devSimulation.targets.customIndicators")} ${devSimulation.visibleJob.createdCounts.customIndicatorProfiles}/${devSimulation.visibleJob.effectivePlan?.targets.customIndicatorProfiles ?? 0}`}
            </span>
            <span>
              {`${t("settings.devSimulation.targets.realBacktests")} ${devSimulation.visibleJob.createdCounts.realBacktestBatches}/${devSimulation.visibleJob.effectivePlan?.targets.realBacktestBatches ?? 0}`}
            </span>
            <span>
              {`${t("settings.devSimulation.status.throughput")} ${Math.round(devSimulation.visibleJob.throughput.itemsPerMinute)} ${t("settings.devSimulation.status.perMinute")}`}
            </span>
            <span>
              {`${t("settings.devSimulation.status.remaining")} ${devSimulation.visibleJobRemainingText}`}
            </span>
            {(devSimulation.visibleJob.status === "FAILED" ||
              devSimulation.visibleJob.status === "INTERRUPTED") &&
            devSimulation.visibleJob.errorCode ? (
              <span>{devSimulation.visibleJob.errorCode}</span>
            ) : null}
          </div>
        </section>
      ) : null}
    </WorkspaceSection>
  );
}

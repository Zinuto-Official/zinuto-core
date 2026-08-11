// SPDX-License-Identifier: GPL-3.0-only

import type { ApiSystemDevSimulationJob } from "@/api";
import type { AppTextKey } from "@/frontend-kernel/i18n/messageRuntime";
import { Button } from "@/ui/primitives/button";
import { Checkbox } from "@/ui/primitives/checkbox";
import { Input } from "@/ui/primitives/input";
import { SegmentedControl } from "@/ui/primitives/segmented-control";
import { PlainTabBar, SettingRow, WorkspaceSection } from "@/ui/components";
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
    ["customIndicatorProfiles", t("settings.devSimulation.targets.customIndicators")],
    ["realBacktestBatches", t("settings.devSimulation.targets.realBacktests")],
  ];

  return (
    <WorkspaceSection
      title={tt("appText.simulationSeedData")}
      className="settings-flow-group"
      bodyClassName="settings-flow-row-list"
    >
      <div className="settings-action-panel settings-simulation-panel">
        <SettingRow
          title={tt("appText.generateData")}
          description={t("settings.storage.devSimulation.description")}
          control={
            <div className="settings-action-panel-actions">
              <Button
                variant="ghost"
                size="xs"
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
              <Button
                variant="ghost"
                size="xs"
                onClick={() => void devSimulation.start()}
                disabled={
                  disabled ||
                  devSimulation.isStarting ||
                  devSimulation.isCleaning ||
                  !devSimulation.canStart ||
                  !hasSimulationTargets ||
                  !simulationSeed.trim()
                }
                loading={devSimulation.isStarting}
                loadingLabel={tt("appText.generateData")}
              >
                {tt("appText.generateData")}
              </Button>
              {devSimulation.cancelAction.enabled ? (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => void devSimulation.cancel()}
                  disabled={
                    disabled ||
                    devSimulation.isCleaning ||
                    !devSimulation.cancelAction.enabled
                  }
                >
                  <span className="settings-storage-refresh-btn-content">
                    <span>{tt("appText.cancel")}</span>
                  </span>
                </Button>
              ) : null}
            </div>
          }
        />
        <SettingRow
          title={t("settings.devSimulation.dataSelection.title")}
          description={t("settings.devSimulation.dataSelection.description")}
          control={
            <span className="settings-action-panel-hint">
              {t("settings.devSimulation.dataSelection.action")}
            </span>
          }
        />
        <SettingRow
          title={t("settings.devSimulation.profile.title")}
          description={
            <>
              <span>
                {visibleSimulationProfileOptions.find(
                  (option) => option.key === simulationProfileId,
                )?.description ?? ""}
              </span>
              {simulationProfileId === "STRESS" ? (
                <span className="settings-action-panel-hint">
                  {t("settings.devSimulation.profile.stressWarning")}
                </span>
              ) : null}
            </>
          }
          control={
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
              className="settings-dev-simulation-profile-tabbar"
              itemClassName="settings-dev-simulation-profile-tab"
            />
          }
        />
        <SettingRow
          title={t("settings.devSimulation.controls.repeatMode")}
          description={
            simulationRepeatMode === "REPLACE"
              ? t("settings.devSimulation.controls.replace")
              : t("settings.devSimulation.controls.append")
          }
          control={
            <SegmentedControl
              value={simulationRepeatMode}
              options={[
                { value: "REPLACE", label: t("settings.devSimulation.controls.replace") },
                { value: "APPEND", label: t("settings.devSimulation.controls.append") },
              ]}
              onChange={(value) =>
                onSimulationRepeatModeChange(value as "REPLACE" | "APPEND")
              }
              className="settings-dev-simulation-repeat-mode"
            />
          }
        />
        <SettingRow
          title={t("settings.devSimulation.controls.seed")}
          control={
            <Input
              className="settings-dev-simulation-seed"
              value={simulationSeed}
              maxLength={128}
              onChange={(event) => onSimulationSeedChange(event.target.value)}
              aria-label={t("settings.devSimulation.controls.seed")}
            />
          }
        />
        <div className="settings-dev-simulation-targets">
          <div className="settings-action-panel-actions">
            <Button variant="ghost" size="xs" onClick={onRestoreSimulationPreset}>
              {t("settings.devSimulation.controls.selectAll")}
            </Button>
            <Button variant="ghost" size="xs" onClick={onClearSimulationTargets}>
              {t("settings.devSimulation.controls.clearAll")}
            </Button>
            <Button variant="ghost" size="xs" onClick={onRestoreSimulationPreset}>
              {t("settings.devSimulation.controls.restorePreset")}
            </Button>
          </div>
          <span className="settings-action-panel-hint">
            {t("settings.devSimulation.targets.title")}
          </span>
          {targetEntries.map(([key, label]) => (
            <label className="settings-dev-simulation-target" key={key}>
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
              <Input
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
        {devSimulation.disabledReason ? (
          <span className="settings-action-panel-hint">
            {devSimulation.disabledReason}
          </span>
        ) : null}
        {devSimulation.feedbackText ? (
          <span
            className={`settings-action-panel-hint ${devSimulation.feedbackTone === "error" ? "is-error" : devSimulation.feedbackTone === "success" ? "is-success" : ""}`}
          >
            {devSimulation.feedbackText}
          </span>
        ) : null}
        {devSimulation.visibleCleanupJob ? (
          <div className="settings-action-panel-status">
            <div className="settings-action-panel-status-head">
              <span>{tt("appText.latestCleanupJob")}</span>
              <strong>
                {formatPercent(devSimulation.visibleCleanupJob.progressPercent, tt)}
              </strong>
            </div>
            <span className="settings-action-panel-phase">
              {tt("appText.cleanupJobProgress")}
            </span>
            <div className="settings-action-panel-track">
              <span
                style={{
                  width: `${Math.max(0, Math.min(100, devSimulation.visibleCleanupJob.progressPercent))}%`,
                }}
              />
            </div>
            <div className="settings-action-panel-stats">
              <span>
                {resolveSimulationCleanupStageText(
                  devSimulation.visibleCleanupJob.stage,
                  tt,
                )}
              </span>
            </div>
          </div>
        ) : devSimulation.visibleJob ? (
          <div className="settings-action-panel-status">
            <div className="settings-action-panel-status-head">
              <span>{tt("appText.latestSimulationJob")}</span>
              <strong>{formatPercent(devSimulation.visibleJob.progressPercent, tt)}</strong>
            </div>
            <span className="settings-action-panel-phase">
              {resolveSimulationJobStatusText(devSimulation.visibleJob, tt)}
            </span>
            <div className="settings-action-panel-track">
              <span
                style={{
                  width: `${Math.max(0, Math.min(100, devSimulation.visibleJob.progressPercent))}%`,
                }}
              />
            </div>
            <div className="settings-action-panel-stats">
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
              {(devSimulation.visibleJob.status === "FAILED" ||
                devSimulation.visibleJob.status === "INTERRUPTED") &&
              devSimulation.feedbackText ? (
                <span>{devSimulation.feedbackText}</span>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </WorkspaceSection>
  );
}

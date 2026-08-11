// SPDX-License-Identifier: GPL-3.0-only

import {
  APP_COPY_BASE_LANGUAGE,
  APP_COPY_LANGUAGES,
  formatCopyTemplate,
  resolveAppCopyLanguage,
  type AppCopyLanguage,
} from "./copy.js";
import { loadLocaleCatalog } from "@zinuto/shared/i18n";

export const SYSTEM_DEV_SIMULATION_COPY_LANGUAGES = APP_COPY_LANGUAGES;
export type SystemDevSimulationCopyLanguage = AppCopyLanguage;
export const SYSTEM_DEV_SIMULATION_COPY_BASE_LANGUAGE = APP_COPY_BASE_LANGUAGE;
export const resolveAppUiLanguage = resolveAppCopyLanguage;

export type SystemDevSimulationCopy = {
  titles: {
    sessionName: string;
    trainingRecord: string;
    historyReview: string;
    customNote: string;
    fastDecisionReview: string;
    riskDisciplineReview: string;
  };
  noteSeeds: {
    trainingRecord: string;
    historyReview: string;
    customNote: string;
    challengeNote: string;
  };
  narrativeSegments: readonly string[];
  fastDecisionChoices: {
    LONG: string;
    SHORT: string;
    OBSERVE: string;
  };
  summaryLabels: {
    maxDrawdown: string;
    decision: string;
    actual: string;
    edgeRatio: string;
    totalAsset: string;
    totalPnl: string;
    recovery: string;
    alpha: string;
    capture: string;
    grade: string;
    decisionTime: string;
    infinity: string;
  };
  units: {
    secondsShort: string;
  };
  challengeNote: {
    fastDecisionTitle: string;
    riskDisciplineTitle: string;
    symbol: string;
    result: string;
    passed: string;
    failed: string;
    settlementSummary: string;
    notes: string;
  };
  jobMessages: {
    queued: string;
    preparing: string;
    resuming: string;
    freeReplayProgress: string;
    fastDecisionProgress: string;
    riskDisciplineProgress: string;
    completed: string;
    failed: string;
    interrupted: string;
  };
};

const SYSTEM_DEV_SIMULATION_COPY_BY_LANGUAGE: Record<
  AppCopyLanguage,
  SystemDevSimulationCopy
> = Object.fromEntries(
  APP_COPY_LANGUAGES.map((language: AppCopyLanguage) => {
    const catalog = loadLocaleCatalog(language, "appText") as Record<
      string,
      string
    >;
    const message = (key: string): string => {
      const id = `systemDevSimulation.${key}`;
      const value = catalog[id];
      if (typeof value !== "string") {
        throw new Error(`Missing system dev simulation copy "${id}" for ${language}`);
      }
      return value;
    };
    return [
      language,
      {
        titles: {
          sessionName: message("sessionNameTemplate"),
          trainingRecord: message("noteTitle.trainingRecord"),
          historyReview: message("noteTitle.historyReview"),
          customNote: message("noteTitle.custom"),
          fastDecisionReview: message("noteTitle.fastDecisionReview"),
          riskDisciplineReview: message("noteTitle.riskDisciplineReview"),
        },
        noteSeeds: {
          trainingRecord: message("narrativeSeed.trainingRecord"),
          historyReview: message("narrativeSeed.historyReview"),
          customNote: message("narrativeSeed.custom"),
          challengeNote: message("narrativeSeed.challenge"),
        },
        narrativeSegments: Array.from({ length: 10 }, (_value, index) =>
          message(`narrativeSegment.${index}`),
        ),
        fastDecisionChoices: {
          LONG: message("fastDecisionChoice.LONG"),
          SHORT: message("fastDecisionChoice.SHORT"),
          OBSERVE: message("fastDecisionChoice.OBSERVE"),
        },
        summaryLabels: {
          maxDrawdown: message("summary.maxDrawdown"),
          decision: message("summary.judgment"),
          actual: message("summary.actual"),
          edgeRatio: message("summary.edgeRatio"),
          totalAsset: message("summary.totalAsset"),
          totalPnl: message("summary.floatingResult"),
          recovery: message("summary.recoveryRate"),
          alpha: message("summary.alpha"),
          capture: message("summary.captureRate"),
          grade: message("summary.grade"),
          decisionTime: message("summary.decisionTime"),
          infinity: message("summary.infinity"),
        },
        units: {
          secondsShort: message("unit.secondsShort"),
        },
        challengeNote: {
          fastDecisionTitle: message("challengeReview.fastDecision"),
          riskDisciplineTitle: message("challengeReview.riskDiscipline"),
          symbol: message("challengeLabel.symbol"),
          result: message("challengeLabel.result"),
          passed: message("challengeLabel.passed"),
          failed: message("challengeLabel.failed"),
          settlementSummary: message("challengeLabel.summary"),
          notes: message("challengeLabel.notes"),
        },
        jobMessages: {
          queued: message("jobMessage.queued"),
          preparing: message("jobMessage.preparing"),
          resuming: message("jobMessage.resuming"),
          freeReplayProgress: message("jobMessage.freeReplayProgress"),
          fastDecisionProgress: message("jobMessage.fastDecisionProgress"),
          riskDisciplineProgress: message("jobMessage.riskDisciplineProgress"),
          completed: message("jobMessage.completed"),
          failed: message("jobMessage.failed"),
          interrupted: message("jobMessage.interrupted"),
        },
      } satisfies SystemDevSimulationCopy,
    ];
  }),
) as unknown as Record<AppCopyLanguage, SystemDevSimulationCopy>;

export const getSystemDevSimulationCopy = (
  language: AppCopyLanguage,
): SystemDevSimulationCopy =>
  SYSTEM_DEV_SIMULATION_COPY_BY_LANGUAGE[language] ??
  SYSTEM_DEV_SIMULATION_COPY_BY_LANGUAGE[APP_COPY_BASE_LANGUAGE];

export { formatCopyTemplate };

// SPDX-License-Identifier: GPL-3.0-only

import {
  compileCustomIndicatorScript,
  executeCustomIndicatorScript,
} from "../../customIndicatorRuntimeService.js";
import {
  listCustomIndicatorProfiles,
  replaceCustomIndicatorProfiles,
} from "../../customIndicatorService.js";
import { getCustomIndicatorSystemDefaultTemplates } from "../../customIndicatorEngine/indicator/systemDefaults.js";
import { nowIso } from "../../../kernel/time.js";
import { appError } from "../../../kernel/appError.js";
import type { OhlcvBar } from "../../../domain/models.js";
import {
  SYSTEM_DEV_SIMULATION_INDICATOR_ID_PREFIX,
} from "../../ports/infrastructure/db/systemDevSimulation/cleanupStore.js";
import { throwIfSystemDevSimulationTaskAborted } from "../taskExecutionState.js";
import { buildRealisticIndicatorName } from "../presentation.js";
import type { SystemDevSimulationCopyLanguage } from "@zinuto/shared/systemDevSimulationCopy";

const seedNumber = (seed: string): number =>
  Array.from(seed).reduce(
    (value, character) => ((value * 31 + character.charCodeAt(0)) >>> 0),
    17,
  );

const buildParameterInputs = (input: {
  seed: string;
  index: number;
  parameters: Array<{ name: string; defaultValue: number; min?: number; max?: number }>;
}): Record<string, string> => {
  const variation = (seedNumber(input.seed) + input.index * 13) % 7;
  return Object.fromEntries(
    input.parameters.map((parameter) => {
      const min = Number.isFinite(parameter.min) ? Number(parameter.min) : 1;
      const max = Number.isFinite(parameter.max) ? Number(parameter.max) : 999;
      const value = Math.max(min, Math.min(max, parameter.defaultValue + variation));
      return [parameter.name, String(value)];
    }),
  );
};

const toRuntimeBars = (bars: readonly OhlcvBar[]) =>
  bars.map((bar) => ({
    time: bar.ts,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
  }));

export const createSystemDevSimulationCustomIndicators = async (input: {
  batchId: string;
  seed: string;
  count: number;
  sampleBars: readonly OhlcvBar[];
  language: SystemDevSimulationCopyLanguage;
  signal?: AbortSignal;
}): Promise<number> => {
  const count = Math.max(0, Math.floor(Number(input.count) || 0));
  if (!count) {
    return 0;
  }
  const templates = getCustomIndicatorSystemDefaultTemplates();
  if (!templates.length) {
    throw appError("SYSTEM_DEV_SIMULATION_INVALID", { reason: "INDICATOR_TEMPLATES" });
  }
  throwIfSystemDevSimulationTaskAborted(input.signal);
  const existing = await listCustomIndicatorProfiles();
  const createdAt = nowIso();
  const generated = Array.from({ length: count }, (_, index) => {
    const template = templates[index % templates.length]!;
    const ordinal = Math.floor(index / templates.length) + 1;
    const name = buildRealisticIndicatorName({
      language: input.language,
      templateId: template.id,
      ordinal,
    });
    const parameterInputs = buildParameterInputs({
      seed: input.seed,
      index,
      parameters: template.definition.parameters,
    });
    const compile = compileCustomIndicatorScript({
      source: template.definition.source,
      parameterInputs,
      displayName: name,
    });
    if (!compile.state) {
      throw appError("SYSTEM_DEV_SIMULATION_INVALID", {
        reason: "INDICATOR_COMPILE",
        templateId: template.id,
      });
    }
    if (input.sampleBars.length && index < templates.length) {
      const execution = executeCustomIndicatorScript({
        compiled: compile.state.compiled,
        input: { bars: toRuntimeBars(input.sampleBars) },
      });
      if (!execution.ok) {
        throw appError("SYSTEM_DEV_SIMULATION_INVALID", {
          reason: "INDICATOR_EXECUTE",
          templateId: template.id,
        });
      }
    }
    return {
      id: `${SYSTEM_DEV_SIMULATION_INDICATOR_ID_PREFIX}${input.batchId}:${index + 1}`,
      name,
      source: template.definition.source,
      parameterInputs,
      revisions: [],
      createdAt,
      updatedAt: createdAt,
    };
  });
  throwIfSystemDevSimulationTaskAborted(input.signal);
  const retained = existing.filter(
    (profile) =>
      !profile.id.startsWith(
        `${SYSTEM_DEV_SIMULATION_INDICATOR_ID_PREFIX}${input.batchId}:`,
      ),
  );
  await replaceCustomIndicatorProfiles([...retained, ...generated]);
  throwIfSystemDevSimulationTaskAborted(input.signal);
  return generated.length;
};

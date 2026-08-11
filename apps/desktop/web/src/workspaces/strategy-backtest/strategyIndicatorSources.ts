// SPDX-License-Identifier: GPL-3.0-only

import type { ApiCompileCustomIndicatorScriptRequest } from "@/api";
import {
  parseSystemDefaultIndicatorOverrideTemplateId,
  type SavedIndicatorProfile,
} from "@/domains/custom-indicator/indicator/profileStore";
import type { CustomIndicatorSystemDefaultTemplate } from "@/workspaces/custom-indicator/customIndicatorWorkspaceReadModelUi";

export type StrategyBacktestIndicatorSource = {
  id: string;
  name: string;
  source: string;
  parameterInputs: Record<string, string>;
  parameters?: ApiCompileCustomIndicatorScriptRequest["parameters"];
};

type BuildStrategyBacktestIndicatorSourcesArgs = {
  savedProfiles: readonly SavedIndicatorProfile[];
  systemTemplates: readonly CustomIndicatorSystemDefaultTemplate[];
};

const SYSTEM_INDICATOR_SOURCE_ID_PREFIX = "system:";

const normalizeText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const normalizeKey = (value: unknown): string =>
  normalizeText(value).toUpperCase();

const normalizeParameterInputs = (
  parameterInputs: unknown,
): Record<string, string> => {
  if (!parameterInputs || typeof parameterInputs !== "object") {
    return {};
  }
  return Object.entries(parameterInputs as Record<string, unknown>).reduce<
    Record<string, string>
  >((acc, [rawKey, rawValue]) => {
    const key = normalizeKey(rawKey);
    if (!key) {
      return acc;
    }
    acc[key] = String(rawValue ?? "");
    return acc;
  }, {});
};

const resolveSystemParameterInputs = (
  parameters: ApiCompileCustomIndicatorScriptRequest["parameters"],
  overrideInputs: Record<string, string> | undefined,
): Record<string, string> => {
  const normalizedOverrideInputs = normalizeParameterInputs(overrideInputs);
  return (parameters ?? []).reduce<Record<string, string>>((acc, parameter) => {
    const key = normalizeKey(parameter.name);
    if (!key) {
      return acc;
    }
    acc[key] =
      normalizedOverrideInputs[key] ?? String(parameter.defaultValue ?? "");
    return acc;
  }, {});
};

export const buildStrategyBacktestIndicatorSources = ({
  savedProfiles,
  systemTemplates,
}: BuildStrategyBacktestIndicatorSourcesArgs): StrategyBacktestIndicatorSource[] => {
  const systemOverrideProfileByTemplateId = new Map<
    string,
    SavedIndicatorProfile
  >();
  savedProfiles.forEach((profile) => {
    const templateId = parseSystemDefaultIndicatorOverrideTemplateId(
      profile.id,
    );
    if (templateId) {
      systemOverrideProfileByTemplateId.set(normalizeKey(templateId), profile);
    }
  });

  const customSources = savedProfiles.flatMap((profile) => {
    const source = normalizeText(profile.source);
    if (!source || parseSystemDefaultIndicatorOverrideTemplateId(profile.id)) {
      return [];
    }
    return [
      {
        id: profile.id,
        name: profile.name,
        source,
        parameterInputs: normalizeParameterInputs(profile.parameterInputs),
      },
    ];
  });

  const systemSources = systemTemplates.flatMap((template) => {
    const templateId = normalizeKey(template.id);
    const source = normalizeText(template.definition.source);
    const name = normalizeText(template.definition.name) || templateId;
    if (!templateId || !source || !name) {
      return [];
    }
    const overrideProfile = systemOverrideProfileByTemplateId.get(templateId);
    const parameters = template.definition.parameters ?? [];
    return [
      {
        id: `${SYSTEM_INDICATOR_SOURCE_ID_PREFIX}${templateId}`,
        name,
        source,
        parameters,
        parameterInputs: resolveSystemParameterInputs(
          parameters,
          overrideProfile?.parameterInputs,
        ),
      },
    ];
  });

  return [...customSources, ...systemSources];
};

export const resolveStrategyBacktestIndicatorSelection = (
  sources: readonly StrategyBacktestIndicatorSource[],
  selectedSourceId: string,
) => {
  const selectedStrategyProfile =
    sources.find((source) => source.id === selectedSourceId) ??
    sources[0] ??
    null;
  return {
    selectedStrategyProfile,
    strategyProfileOptions: sources.map((source) => ({
      value: source.id,
      label: source.name,
      textValue: source.name,
    })),
  };
};

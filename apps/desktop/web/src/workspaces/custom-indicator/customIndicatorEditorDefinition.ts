// SPDX-License-Identifier: GPL-3.0-only

import { normalizeParameterDefinitions } from "@/domains/custom-indicator/indicator/scriptDiagnostics";
import type { IndicatorDefinition } from "@/domains/custom-indicator/indicator/types";

export const normalizeEditorScriptSource = (source: string): string =>
  String(source ?? "").trim();

export const cloneIndicatorDefinitionForEditor = (
  definition: IndicatorDefinition,
): IndicatorDefinition => ({
  ...definition,
  source: normalizeEditorScriptSource(definition.source),
  parameters: normalizeParameterDefinitions(definition.parameters),
  outputs: definition.outputs.map((output) => ({
    ...output,
    directives: output.directives ? [...output.directives] : undefined,
    directiveFamilies: output.directiveFamilies
      ? [...output.directiveFamilies]
      : undefined,
    style: output.style ? { ...output.style } : undefined,
  })),
});

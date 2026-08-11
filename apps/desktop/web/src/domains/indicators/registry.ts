// SPDX-License-Identifier: GPL-3.0-only

import { syncSavedCustomProfileIndicators } from '@/domains/indicators/customProfileRegistry';
import { tt } from '@/frontend-kernel/i18n/messageRuntime';
import { INDICATOR_COLOR_DIRECTIVES } from '@/ui/theme/visual/indicatorColorDirectives';
import type { CompiledIndicator, IndicatorDefinition } from '@/domains/custom-indicator/indicator/types';
import { registerCompiledIndicatorRuntime } from '@/domains/indicators/runtimeRegistration';

let indicatorsRegistered = false;

const SYSTEM_RUNTIME_INDICATORS: readonly {
  runtimeName: string;
  shortName: string;
  precision: number;
  calcParams: number[];
  definition: IndicatorDefinition;
}[] = Object.freeze([
  {
    runtimeName: 'CF_MA2',
    shortName: 'CF_MA2',
    precision: 3,
    calcParams: [5, 13],
    definition: {
      name: 'CF_MA2',
      source: `
MA_FAST: MA(C, P1), ${INDICATOR_COLOR_DIRECTIVES.dualMa.fast};
MA_SLOW: MA(C, P2), ${INDICATOR_COLOR_DIRECTIVES.dualMa.slow};
      `.trim(),
      parameters: [
        { name: 'P1', defaultValue: 5, min: 1, max: 240 },
        { name: 'P2', defaultValue: 13, min: 1, max: 240 }
      ],
      outputs: [
        { key: 'MA_FAST', title: tt('appText.maFast'), directives: [INDICATOR_COLOR_DIRECTIVES.dualMa.fast, 'LINETHICK2'], renderPrimitive: 'line' },
        { key: 'MA_SLOW', title: tt('appText.maSlow'), directives: [INDICATOR_COLOR_DIRECTIVES.dualMa.slow, 'LINETHICK2'], renderPrimitive: 'line' }
      ]
    }
  }
]);

const buildStaticCompiledIndicator = (
  definition: IndicatorDefinition,
): CompiledIndicator => ({
  definition,
  outputKeys: definition.outputs.map((output) => output.key.trim().toUpperCase()),
  parameterDefaults: Object.fromEntries(
    definition.parameters.map((parameter) => [
      parameter.name.trim().toUpperCase(),
      Number(parameter.defaultValue),
    ]),
  ),
});

export const registerCustomIndicators = () => {
  if (!indicatorsRegistered) {
    SYSTEM_RUNTIME_INDICATORS.forEach((item) => {
      registerCompiledIndicatorRuntime({
        runtimeName: item.runtimeName,
        shortName: item.shortName,
        calcParams: item.calcParams,
        precision: item.precision,
        compiled: buildStaticCompiledIndicator(item.definition),
      });
    });

    indicatorsRegistered = true;
  }

  // Always sync user-saved custom indicators so replay settings can use latest scripts.
  syncSavedCustomProfileIndicators(registerCompiledIndicatorRuntime);
};

// SPDX-License-Identifier: GPL-3.0-only

import { INDICATOR_COLOR_DIRECTIVES } from './indicatorColorDirectives.js';
import type {
  IndicatorDefinition,
  IndicatorParameterDefinition,
} from './types.js';

export type SystemDefaultIndicatorTemplate = {
  id: string;
  definition: IndicatorDefinition;
};

const cloneParameters = (
  parameters: readonly IndicatorParameterDefinition[],
): IndicatorParameterDefinition[] =>
  parameters.map((parameter) => ({
    ...parameter,
    name: String(parameter.name || '').trim().toUpperCase(),
  }));

const createIndicatorDefinition = (
  name: string,
  source: string,
  parameters: readonly IndicatorParameterDefinition[],
): IndicatorDefinition => ({
  name,
  source: source.trim(),
  parameters: cloneParameters(parameters),
  outputs: [],
});

const {
  warm: SYSTEM_TEMPLATE_WARM_COLOR,
  teal: SYSTEM_TEMPLATE_TEAL_COLOR,
  pink: SYSTEM_TEMPLATE_PINK_COLOR,
} = INDICATOR_COLOR_DIRECTIVES.systemTemplates;

export const SYSTEM_DEFAULT_VOLUME_TEMPLATE_ID = 'VOL';

export const SYSTEM_DEFAULT_INDICATOR_TEMPLATES: readonly SystemDefaultIndicatorTemplate[] =
  Object.freeze(
    [
      {
        id: 'MACD',
        definition: createIndicatorDefinition(
          'MACD',
          `
DIF: EMA(CLOSE, SHORT) - EMA(CLOSE, LONG), ${SYSTEM_TEMPLATE_WARM_COLOR};
DEA: EMA(DIF, M), ${SYSTEM_TEMPLATE_TEAL_COLOR};
MACD: (DIF - DEA) * 2, STICK, COLORRED;
          `,
          [
            { name: 'SHORT', defaultValue: 12, min: 1, max: 240 },
            { name: 'LONG', defaultValue: 26, min: 1, max: 480 },
            { name: 'M', defaultValue: 9, min: 1, max: 120 },
          ],
        ),
      },
      {
        id: SYSTEM_DEFAULT_VOLUME_TEMPLATE_ID,
        definition: createIndicatorDefinition(
          'VOL',
          `
VOL_UP: STICKLINE(CLOSE >= OPEN, 0, VOL, 2, 0), COLORRED;
VOL_DOWN: STICKLINE(CLOSE < OPEN, 0, VOL, 2, 0), COLORGREEN;
MA5: MA(VOL, M1), ${SYSTEM_TEMPLATE_WARM_COLOR};
MA10: MA(VOL, M2), ${SYSTEM_TEMPLATE_TEAL_COLOR};
MA20: MA(VOL, M3), ${SYSTEM_TEMPLATE_PINK_COLOR};
          `,
          [
            { name: 'M1', defaultValue: 5, min: 1, max: 240 },
            { name: 'M2', defaultValue: 10, min: 1, max: 240 },
            { name: 'M3', defaultValue: 20, min: 1, max: 240 },
          ],
        ),
      },
      {
        id: 'ATR',
        definition: createIndicatorDefinition(
          'ATR',
          `
TR1: MAX(MAX((HIGH - LOW), ABS(REF(CLOSE, 1) - HIGH)), ABS(REF(CLOSE, 1) - LOW)), ${SYSTEM_TEMPLATE_WARM_COLOR};
ATR1: MA(TR1, M), ${SYSTEM_TEMPLATE_TEAL_COLOR};
          `,
          [{ name: 'M', defaultValue: 14, min: 1, max: 240 }],
        ),
      },
      {
        id: 'SAR',
        definition: createIndicatorDefinition(
          'SAR',
          `
BB: SAR(HIGH, LOW, P1, P2), ${SYSTEM_TEMPLATE_TEAL_COLOR};
          `,
          [
            { name: 'P1', defaultValue: 2, min: 1, max: 100 },
            { name: 'P2', defaultValue: 20, min: 1, max: 200 },
            { name: 'P3', defaultValue: 0, min: 0, max: 100 },
          ],
        ),
      },
      {
        id: 'KDJ',
        definition: createIndicatorDefinition(
          'KDJ',
          `
RSV := (CLOSE - LLV(LOW, P1)) / (HHV(HIGH, P1) - LLV(LOW, P1)) * 100;
K: SMA(RSV, P2, 1), ${SYSTEM_TEMPLATE_WARM_COLOR};
D: SMA(K, P3, 1), ${SYSTEM_TEMPLATE_TEAL_COLOR};
J: 3 * K - 2 * D, ${SYSTEM_TEMPLATE_PINK_COLOR};
          `,
          [
            { name: 'P1', defaultValue: 9, min: 1, max: 240 },
            { name: 'P2', defaultValue: 3, min: 1, max: 120 },
            { name: 'P3', defaultValue: 3, min: 1, max: 120 },
          ],
        ),
      },
      {
        id: 'RSI',
        definition: createIndicatorDefinition(
          'RSI',
          `
LC := REF(CLOSE, 1);
TEMP1 := MAX(CLOSE - LC, 0);
TEMP2 := ABS(CLOSE - LC);
RSI1: SMA(TEMP1, P1, 1) / SMA(TEMP2, P1, 1) * 100, ${SYSTEM_TEMPLATE_WARM_COLOR};
RSI2: SMA(TEMP1, P2, 1) / SMA(TEMP2, P2, 1) * 100, ${SYSTEM_TEMPLATE_TEAL_COLOR};
RSI3: SMA(TEMP1, P3, 1) / SMA(TEMP2, P3, 1) * 100, ${SYSTEM_TEMPLATE_PINK_COLOR};
          `,
          [
            { name: 'P1', defaultValue: 6, min: 1, max: 240 },
            { name: 'P2', defaultValue: 12, min: 1, max: 240 },
            { name: 'P3', defaultValue: 24, min: 1, max: 240 },
          ],
        ),
      },
    ] satisfies SystemDefaultIndicatorTemplate[],
  );

const cloneDefinition = (
  definition: IndicatorDefinition,
): IndicatorDefinition => ({
  ...definition,
  parameters: cloneParameters(definition.parameters),
  outputs: definition.outputs.map((output) => ({
    ...output,
    directives: output.directives ? [...output.directives] : undefined,
    directiveFamilies: output.directiveFamilies
      ? [...output.directiveFamilies]
      : undefined,
    style: output.style ? { ...output.style } : undefined,
  })),
});

export const getCustomIndicatorSystemDefaultTemplates =
  (): SystemDefaultIndicatorTemplate[] =>
    SYSTEM_DEFAULT_INDICATOR_TEMPLATES.map((template) => ({
      id: template.id,
      definition: cloneDefinition(template.definition),
    }));

export const buildCustomIndicatorSystemDefaultsReadModel = () => {
  const templates = getCustomIndicatorSystemDefaultTemplates();
  return {
    defaultTemplateId: templates[0]?.id ?? null,
    volumeTemplateId: SYSTEM_DEFAULT_VOLUME_TEMPLATE_ID,
    templates,
  };
};

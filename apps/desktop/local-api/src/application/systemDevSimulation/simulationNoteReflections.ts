// SPDX-License-Identifier: GPL-3.0-only

import { resolveReplayNoteReflectionSectionLabel } from '@zinuto/shared/replayNoteBuilder';
import type { ReplayRatioState } from '@zinuto/shared/replay';
import { resolveAppUiLanguage } from '@zinuto/shared/systemDevSimulationCopy';
import type { SpecialTrainingModeId } from '../../domain/specialTraining/contracts.js';

type SimulationLanguage = ReturnType<typeof resolveAppUiLanguage>;

export const formatSimulationProfitFactor = (
  value: number | null,
  state: ReplayRatioState,
  notAvailableLabel: string,
): string =>
  state === 'POSITIVE_INFINITY'
    ? '∞'
    : state === 'FINITE' && typeof value === 'number' && Number.isFinite(value)
      ? value.toFixed(2)
      : notAvailableLabel;

const SPECIAL_TRAINING_REFLECTION_COPY: Record<
  SimulationLanguage,
  {
    fastSpeed: string;
    fastInstinct: string;
    riskSpeed: string;
    riskInstinct: string;
    riskReflection: string;
    recoveryAction: string;
  }
> = {
  'zh-CN': {
    fastSpeed:
      '重点检查自己是在第一反应阶段就确认方向，还是拖到接近时间上限才行动。',
    fastInstinct:
      '结合当前优势比与胜率摘要，判断这次是直觉有效、直觉失真，还是因为超时而错过机会。',
    riskSpeed: '先定位决策速度、风险动作与结果之间的关系。',
    riskInstinct:
      '结合当前摘要，检查第一反应是否帮助你降低风险，还是放大了失控动作。',
    riskReflection:
      '结合评级、修复率与回撤摘要，检查自己是否及时减亏，还是在压力下继续加码。',
    recoveryAction:
      '把这次处理归纳成下一次的固定动作，明确保命、修复或停止的触发条件。',
  },
  en: {
    fastSpeed:
      'Review whether direction was identified early or only near the time limit.',
    fastInstinct:
      'Use the current advantage and win-rate summary to decide whether instinct was aligned, distorted, or delayed by timeout.',
    riskSpeed: 'Start by linking decision speed, risk action, and outcome.',
    riskInstinct:
      'Use the current summary to check whether the first response reduced risk or amplified the unstable action.',
    riskReflection:
      'Use the grade, recovery, and drawdown summary to check whether loss was cut early or pressure triggered more risk.',
    recoveryAction:
      'Turn this handling pattern into a concrete next action with explicit stop, recover, or stand-down triggers.',
  },
  ja: {
    fastSpeed:
      '方向を最初の反応で判断できたか、それとも制限時間直前まで行動を遅らせたかを確認してください。',
    fastInstinct:
      '優位性と勝率の要約を基に、直感が有効だったか、ずれていたか、時間切れで機会を逃したかを確認してください。',
    riskSpeed:
      'まず、判断速度・リスク行動・結果のつながりを整理してください。',
    riskInstinct:
      '現在の要約を基に、最初の反応がリスクを抑えたか、不安定な行動を増幅したかを確認してください。',
    riskReflection:
      '評価、回復率、ドローダウンを基に、早めに損失を抑えたか、プレッシャー下でリスクを追加したかを確認してください。',
    recoveryAction:
      '今回の対応を次回の具体的な行動に落とし込み、停止・回復・撤退の条件を明確にしてください。',
  },
  ko: {
    fastSpeed:
      '첫 반응 단계에서 방향을 판단했는지, 제한 시간 직전까지 행동을 미뤘는지 확인하세요.',
    fastInstinct:
      '현재 우위와 승률 요약을 바탕으로 직감이 맞았는지, 왜곡되었는지, 시간 초과로 기회를 놓쳤는지 점검하세요.',
    riskSpeed:
      '먼저 판단 속도, 위험 행동, 결과 사이의 관계를 정리하세요.',
    riskInstinct:
      '현재 요약을 바탕으로 첫 반응이 위험을 줄였는지, 불안정한 행동을 키웠는지 확인하세요.',
    riskReflection:
      '등급, 회복률, 낙폭 요약을 바탕으로 손실을 일찍 줄였는지, 압박 속에서 위험을 더했는지 점검하세요.',
    recoveryAction:
      '이번 대응을 다음번의 구체적인 행동으로 정리하고 중단, 회복, 철수 조건을 명확히 하세요.',
  },
  es: {
    fastSpeed:
      'Revisa si identificaste la dirección al principio o si esperaste hasta casi agotar el tiempo.',
    fastInstinct:
      'Usa la ventaja y la tasa de acierto actuales para decidir si la intuición fue válida, estuvo sesgada o llegó tarde.',
    riskSpeed:
      'Empieza relacionando la velocidad de decisión, la acción de riesgo y el resultado.',
    riskInstinct:
      'Usa el resumen actual para comprobar si la primera reacción redujo el riesgo o amplificó una acción inestable.',
    riskReflection:
      'Usa la nota, la recuperación y el drawdown para comprobar si redujiste la pérdida a tiempo o añadiste riesgo bajo presión.',
    recoveryAction:
      'Convierte esta experiencia en una acción concreta con condiciones claras para parar, recuperarte o retirarte.',
  },
};

export const buildPopulatedReflectionSections = (params: {
  language: SimulationLanguage;
  reflectionSections: ReadonlyArray<{ key: string }>;
  reflectionEntries: Readonly<Record<string, { value?: string }>>;
}): Array<{ label: string; value: string }> =>
  params.reflectionSections.flatMap((section) => {
    const value = String(params.reflectionEntries[section.key]?.value ?? '').trim();
    if (!value) {
      return [];
    }
    return [
      {
        label: resolveReplayNoteReflectionSectionLabel(
          params.language,
          section.key,
        ),
        value,
      },
    ];
  });

export const buildSpecialTrainingReflectionEntries = (params: {
  modeId: SpecialTrainingModeId;
  language: SimulationLanguage;
}): Record<string, { value: string }> => {
  const copy = SPECIAL_TRAINING_REFLECTION_COPY[params.language];
  if (params.modeId === 'fast-decision-training') {
    return {
      speedAssessment: { value: copy.fastSpeed },
      instinctCheck: { value: copy.fastInstinct },
    };
  }
  return {
    speedAssessment: { value: copy.riskSpeed },
    instinctCheck: { value: copy.riskInstinct },
    riskReflection: { value: copy.riskReflection },
    recoveryAction: { value: copy.recoveryAction },
  };
};

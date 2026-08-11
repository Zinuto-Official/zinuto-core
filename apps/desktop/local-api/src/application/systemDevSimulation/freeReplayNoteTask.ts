// SPDX-License-Identifier: GPL-3.0-only

import {
  buildReplayNoteDefaultTitle,
  buildReplayNoteSeedMeta,
  buildReplayNoteSourceForCreate,
  getReplayNoteBuilderCopy,
} from '@zinuto/shared/replayNoteBuilder';
import {
  REPLAY_NOTE_COLOR_TOKENS,
  type ReplayNoteColorToken,
} from '@zinuto/shared/replayNoteColors';
import {
  normalizeReplayNoteDocument,
  type ReplayNoteBlockV1,
  type ReplayNoteDocumentV1,
} from '@zinuto/shared/replayNoteDocument';
import { deriveReplayProfitFactor } from '@zinuto/shared/replay';
import { formatMessage } from '@zinuto/shared/i18n';
import { resolveAppUiLanguage } from '@zinuto/shared/systemDevSimulationCopy';
import type { SystemDevSimulationEffectivePlan } from '@zinuto/shared/systemDevSimulationProfiles';
import {
  buildPopulatedReflectionSections,
  formatSimulationProfitFactor,
} from './simulationNoteReflections.js';
import { throwIfSystemDevSimulationTaskAborted } from './taskExecutionState.js';
import { createReplayNote } from '../replayNoteService.js';
import { createSystemDevSimulationRandom } from '../../domain/systemDevSimulation/random.js';
import {
  DEFAULT_INITIAL_CAPITAL,
  buildTrainingSummaryFromReplay,
  clamp,
  pickDisplayPeriod,
  randomFloat,
  randomInt,
  shiftIso,
  type ReplayArchive,
  type SupportedBaseTimeframe,
} from '../../domain/systemDevSimulation/sharedDomain.js';

export type FreeReplayScenarioArchetype =
  | 'TREND_CONTINUATION'
  | 'FALSE_BREAKOUT'
  | 'RANGE_ROTATION'
  | 'MEAN_REVERSION'
  | 'SHORT_OPPORTUNITY'
  | 'SCALE_IN_OUT'
  | 'WATCH_ONLY'
  | 'FORCED_EXIT';

type FreeReplayBoundNoteType = 'FREE_REPLAY';

export type SimulationSummaryChip = {
  label: string;
  value: string;
  tone?: 'neutral' | 'positive' | 'warning' | 'danger';
};

type ReplayTradeRoundLike = {
  pnl?: number;
};

export const FREE_REPLAY_SCENARIO_ARCHETYPES: readonly FreeReplayScenarioArchetype[] =
  [
    'TREND_CONTINUATION',
    'FALSE_BREAKOUT',
    'RANGE_ROTATION',
    'MEAN_REVERSION',
    'SHORT_OPPORTUNITY',
    'SCALE_IN_OUT',
    'WATCH_ONLY',
    'FORCED_EXIT',
  ] as const;

const FREE_REPLAY_NOTE_TYPE_CYCLE: readonly FreeReplayBoundNoteType[] = [
  'FREE_REPLAY',
] as const;

export const resolveScenarioLabel = (
  archetype: FreeReplayScenarioArchetype,
  language: ReturnType<typeof resolveAppUiLanguage>,
): string => {
  const zh =
    archetype === 'TREND_CONTINUATION'
      ? '趋势延续'
      : archetype === 'FALSE_BREAKOUT'
        ? '假突破止损'
        : archetype === 'RANGE_ROTATION'
          ? '区间震荡'
          : archetype === 'MEAN_REVERSION'
            ? '均值回归'
            : archetype === 'SHORT_OPPORTUNITY'
              ? '做空机会'
              : archetype === 'SCALE_IN_OUT'
                ? '分批加减仓'
                : archetype === 'WATCH_ONLY'
                  ? '空仓观察'
                  : '强制结束';
  if (language === 'zh-CN') {
    return zh;
  }
  switch (archetype) {
    case 'TREND_CONTINUATION':
      return 'Trend Continuation';
    case 'FALSE_BREAKOUT':
      return 'False Breakout';
    case 'RANGE_ROTATION':
      return 'Range Rotation';
    case 'MEAN_REVERSION':
      return 'Mean Reversion';
    case 'SHORT_OPPORTUNITY':
      return 'Short Opportunity';
    case 'SCALE_IN_OUT':
      return 'Scale In/Out';
    case 'WATCH_ONLY':
      return 'Watch Only';
    case 'FORCED_EXIT':
    default:
      return 'Forced Exit';
  }
};

const deriveReplayTradeRounds = (
  replay: ReplayArchive,
): ReplayTradeRoundLike[] =>
  Array.isArray((replay as { tradeRounds?: unknown }).tradeRounds)
    ? (
        (replay as unknown as { tradeRounds: ReplayTradeRoundLike[] })
          .tradeRounds ?? []
      )
    : [];

const deriveReplayPerformanceMetrics = (replay: ReplayArchive) => {
  const tradeRounds = deriveReplayTradeRounds(replay);
  const winningTrades = tradeRounds.filter(
    (round) => Number(round?.pnl) > 0,
  ).length;
  const profitTradeTotal = tradeRounds.reduce(
    (sum, round) => sum + Math.max(0, Number(round?.pnl) || 0),
    0,
  );
  const lossTradeTotal = Math.abs(
    tradeRounds.reduce(
      (sum, round) => sum + Math.min(0, Number(round?.pnl) || 0),
      0,
    ),
  );
  return {
    closedTrades: tradeRounds.length,
    winRate: tradeRounds.length > 0 ? winningTrades / tradeRounds.length : 0,
    profitLossRatio: deriveReplayProfitFactor(
      profitTradeTotal,
      lossTradeTotal,
    ),
  };
};

export const buildSimulationColors = (
  colorCount: number,
  seed: string,
  requiredTokens: readonly ReplayNoteColorToken[] = [],
): ReplayNoteColorToken[] => {
  const random = createSystemDevSimulationRandom(seed);
  const requestedColorCount = Math.max(
    1,
    Math.min(5, Math.floor(colorCount || 0)),
  );
  const colors: ReplayNoteColorToken[] = [];
  for (const token of requiredTokens) {
    if (REPLAY_NOTE_COLOR_TOKENS.includes(token) && !colors.includes(token)) {
      colors.push(token);
    }
  }
  for (const token of random.shuffle([...REPLAY_NOTE_COLOR_TOKENS])) {
    if (colors.length >= requestedColorCount) {
      break;
    }
    if (!colors.includes(token)) {
      colors.push(token);
    }
  }
  return colors.slice(0, requestedColorCount);
};

export const noteTextBlock = (
  blockKind: 'PARAGRAPH' | 'H2',
  text: string,
): ReplayNoteBlockV1 => ({
  blockKind,
  children: text
    ? [
        {
          inlineKind: 'TEXT',
          text,
        },
      ]
    : [],
});

const noteListBlock = (
  blockKind: 'BULLET_LIST' | 'ORDERED_LIST',
  items: string[],
): ReplayNoteBlockV1 => ({
  blockKind,
  items: items.map((text) =>
    text
      ? [
          {
            inlineKind: 'TEXT',
            text,
          },
        ]
      : [],
  ),
});

export const buildDocumentFromReflection = (
  title: string,
  introLines: string[],
  summaryTitle: string,
  summaryChips: SimulationSummaryChip[],
  reflectionTitle: string,
  reflectionSections: Array<{ label: string; value: string }>,
): ReplayNoteDocumentV1 =>
  normalizeReplayNoteDocument({
    schemaVersion: 1,
    blocks: [
      noteTextBlock('H2', title),
      noteListBlock('BULLET_LIST', introLines),
      noteTextBlock('H2', summaryTitle),
      noteListBlock(
        'BULLET_LIST',
        summaryChips.map((chip) => `${chip.label} ${chip.value}`),
      ),
      noteTextBlock('H2', reflectionTitle),
      ...reflectionSections.flatMap((section) => [
        noteTextBlock('H2', section.label),
        noteTextBlock('PARAGRAPH', section.value),
      ]),
    ],
  });

const buildFreeReplaySummaryChips = (params: {
  replay: ReplayArchive;
  archetype: FreeReplayScenarioArchetype;
  displayPeriod: string;
  language: ReturnType<typeof resolveAppUiLanguage>;
}): SimulationSummaryChip[] => {
  const metrics = deriveReplayPerformanceMetrics(params.replay);
  const noteCopy = getReplayNoteBuilderCopy(params.language);
  const profitFactor = metrics.profitLossRatio;
  const profitFactorNotAvailable = formatMessage(
    params.language,
    'common.metric.notAvailable',
  );
  const totalTrades = metrics.closedTrades;
  const maxDrawdownRatio = Math.max(
    0,
    Number(
      buildTrainingSummaryFromReplay(params.replay, DEFAULT_INITIAL_CAPITAL)
        .maxDrawdownRate,
    ) || 0,
  );
  const chips: SimulationSummaryChip[] = [
    {
      label: noteCopy.scenario,
      value: resolveScenarioLabel(params.archetype, params.language),
    },
    {
      label: noteCopy.trades,
      value: String(totalTrades),
      tone: totalTrades >= 3 ? ('positive' as const) : ('warning' as const),
    },
    {
      label: noteCopy.winRate,
      value: `${Math.round(metrics.winRate * 100)}%`,
      tone:
        metrics.winRate >= 0.5
          ? ('positive' as const)
          : ('danger' as const),
    },
    {
      label: noteCopy.profitLossRatio,
      value: formatSimulationProfitFactor(
        profitFactor.value,
        profitFactor.state,
        profitFactorNotAvailable,
      ),
      tone:
        profitFactor.state === 'POSITIVE_INFINITY' ||
        (profitFactor.state === 'FINITE' && (profitFactor.value ?? 0) >= 1)
          ? ('positive' as const)
          : profitFactor.state === 'FINITE'
            ? ('warning' as const)
            : ('neutral' as const),
    },
    {
      label: noteCopy.maxDrawdown,
      value: `${(maxDrawdownRatio * 100).toFixed(1)}%`,
      tone:
        maxDrawdownRatio <= 0.08
          ? ('positive' as const)
          : ('danger' as const),
    },
    {
      label: noteCopy.period,
      value: params.displayPeriod,
    },
  ].slice(0, 6);
  return chips;
};

const buildFreeReplayReflectionEntries = (params: {
  noteType: FreeReplayBoundNoteType;
  archetype: FreeReplayScenarioArchetype;
  summaryChips: SimulationSummaryChip[];
  language: ReturnType<typeof resolveAppUiLanguage>;
}): Record<string, { value: string; updatedAt?: string }> => {
  const scenarioLabel = resolveScenarioLabel(params.archetype, params.language);
  const reviewSummary = params.summaryChips
    .map((chip) => `${chip.label} ${chip.value}`)
    .join(' / ');
  return {
    marketFacts: {
      value:
        params.language === 'zh-CN'
          ? `当前复盘对应${scenarioLabel}场景，优先观察量价是否继续确认，避免把短期波动误判成趋势延续。`
          : `This review follows a ${scenarioLabel.toLowerCase()} setup. Confirm price and volume before treating the move as continuation.`,
    },
    executionAssessment: {
      value:
        params.language === 'zh-CN'
          ? `本次复盘回到${scenarioLabel}场景，优先检查执行是否跟随结构变化，而不是只盯最终盈亏。`
          : `Review this ${scenarioLabel.toLowerCase()} setup by checking whether execution adapted to structure instead of focusing only on final PnL.`,
    },
    nextAction: {
      value:
        params.language === 'zh-CN'
          ? '下一次遇到同类场景时，先确认结构是否成立，再决定是否继续、减仓或直接结束。'
          : 'For the next similar setup, confirm that the structure still holds before continuing, scaling down, or stopping.',
    },
    emotionState: {
      value:
        params.language === 'zh-CN'
          ? `当前摘要：${reviewSummary}。重点检查自己是否因为连续K线而产生追价冲动。`
          : `Current summary: ${reviewSummary}. Watch for chasing after several bars in the same direction.`,
    },
  };
};

const resolveReplayEventCursorIndex = (
  replay: ReplayArchive,
  maxCursorIndex: number,
  random: ReturnType<typeof createSystemDevSimulationRandom>,
): number => {
  const candidates: number[] = [];
  const pushIndex = (value: unknown) => {
    const index = Math.floor(Number(value));
    if (!Number.isFinite(index)) {
      return;
    }
    candidates.push(clamp(index, 0, maxCursorIndex));
  };
  (Array.isArray(replay.snapshot?.fills) ? replay.snapshot.fills : []).forEach(
    (fill) => pushIndex(fill?.fill_index),
  );
  (Array.isArray(replay.drawings) ? replay.drawings : []).forEach((drawing) => {
    if (!drawing || typeof drawing !== 'object') {
      return;
    }
    const points = Array.isArray((drawing as { points?: unknown }).points)
      ? ((drawing as { points?: unknown[] }).points ?? [])
      : [];
    points.forEach((point) => {
      if (point && typeof point === 'object') {
        pushIndex((point as { dataIndex?: unknown }).dataIndex);
      }
    });
  });
  if (candidates.length) {
    const eventIndex = random.pick(candidates);
    return clamp(eventIndex + randomInt(0, 2, random), 0, maxCursorIndex);
  }
  return clamp(
    Math.floor(maxCursorIndex * randomFloat(0.58, 0.86, random)),
    0,
    maxCursorIndex,
  );
};

export const buildFreeReplayNoteTask = async (params: {
  projectId: string;
  replay: ReplayArchive;
  baseTimeframe: SupportedBaseTimeframe;
  createdAt: string;
  index: number;
  language: ReturnType<typeof resolveAppUiLanguage>;
  simulationBatchId: string;
  archetype: FreeReplayScenarioArchetype;
  notePolicy: SystemDevSimulationEffectivePlan['notePolicy'];
  requiredColorTokens?: readonly ReplayNoteColorToken[];
  signal?: AbortSignal;
}): Promise<{ created: boolean; contextCursorIndex: number | null }> => {
  throwIfSystemDevSimulationTaskAborted(params.signal);
  const noteRandom = createSystemDevSimulationRandom(
    `${params.simulationBatchId}:free-note:${params.index}`,
  );
  const forceCoverage =
    params.index < params.notePolicy.freeReplayForceCreateUntil;
  const shouldCreate =
    forceCoverage ||
    noteRandom.next() < params.notePolicy.freeReplayCreateProbability;
  if (!shouldCreate) {
    return { created: false, contextCursorIndex: null };
  }
  const noteType =
    FREE_REPLAY_NOTE_TYPE_CYCLE[
      params.index % FREE_REPLAY_NOTE_TYPE_CYCLE.length
    ] ?? 'FREE_REPLAY';
  const meta = buildReplayNoteSeedMeta(noteType);
  const sessionId =
    typeof params.replay.snapshot?.session?.id === 'string'
      ? params.replay.snapshot.session.id.trim()
      : '';
  const maxCursorIndex = clamp(
    Number(params.replay.snapshot?.session?.cursor_index) ||
      params.replay.bars.length - 1,
    0,
    Math.max(0, params.replay.bars.length - 1),
  );
  const displayPeriod = pickDisplayPeriod(
    params.baseTimeframe,
    noteRandom.fork('display-period'),
  );
  const summaryChips = buildFreeReplaySummaryChips({
    replay: params.replay,
    archetype: params.archetype,
    displayPeriod,
    language: params.language,
  });
  const reflectionEntries = buildFreeReplayReflectionEntries({
    noteType,
    archetype: params.archetype,
    summaryChips,
    language: params.language,
  });
  const noteCopy = getReplayNoteBuilderCopy(params.language);
  const contentDocument = buildDocumentFromReflection(
    noteCopy.trainingRecord,
    [
      `${noteCopy.symbol} ${params.replay.snapshot.session.symbol}`,
      `${noteCopy.period} ${displayPeriod}`,
      `${noteCopy.scenario} ${resolveScenarioLabel(
        params.archetype,
        params.language,
      )}`,
    ],
    noteCopy.summary,
    summaryChips,
    noteCopy.reflection,
    buildPopulatedReflectionSections({
      language: params.language,
      reflectionSections: meta.reflectionSections,
      reflectionEntries,
    }),
  );
  const performance = deriveReplayPerformanceMetrics(params.replay);
  const source = buildReplayNoteSourceForCreate({
    noteType,
    trainingProjectId: params.projectId,
    contextSessionId: sessionId || null,
    symbol: params.replay.snapshot.session.symbol,
  });
  const noteReplay: ReplayArchive = {
    ...params.replay,
    noteSummary: {
      chips: summaryChips,
    },
  };
  const noteCreatedAt = shiftIso(
    params.createdAt,
    randomInt(5, 90, noteRandom) * 60 * 1000,
  );
  const contextCursorIndex = resolveReplayEventCursorIndex(
    params.replay,
    maxCursorIndex,
    noteRandom.fork('context-cursor'),
  );
  throwIfSystemDevSimulationTaskAborted(params.signal);
  await createReplayNote({
    title: buildReplayNoteDefaultTitle({
      language: params.language,
      noteType,
      createdAt:
        params.replay.bars[params.replay.bars.length - 1]?.ts ?? noteCreatedAt,
      symbol: params.replay.snapshot.session.symbol,
      displayPeriod,
      baseTimeframe: params.baseTimeframe,
      profitLossRatio:
        performance.profitLossRatio.state === 'POSITIVE_INFINITY'
          ? '∞'
          : performance.profitLossRatio.value,
      winRate: performance.winRate,
    }),
    type: noteType,
    contentDocument,
    contextReplay: noteReplay,
    trainingProjectId: params.projectId,
    contextSessionId: sessionId || null,
    contextCursorIndex,
    contextDisplayPeriod: displayPeriod,
    simulationBatchId: params.simulationBatchId,
    sourceKind: source.kind,
    sourceId: source.id,
    colorTokens: buildSimulationColors(
      params.notePolicy.maxColorCount,
      `${params.simulationBatchId}:free-colors:${params.index}:${noteType}`,
      params.requiredColorTokens,
    ),
    meta: {
      ...meta,
      reflectionEntries,
    },
    createdAt: noteCreatedAt,
    updatedAt: shiftIso(
      noteCreatedAt,
      randomInt(10, 90, noteRandom) * 60 * 1000,
    ),
  });
  throwIfSystemDevSimulationTaskAborted(params.signal);
  return { created: true, contextCursorIndex };
};

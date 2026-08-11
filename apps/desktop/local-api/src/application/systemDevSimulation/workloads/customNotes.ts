// SPDX-License-Identifier: GPL-3.0-only

import { createReplayNote } from "../../replayNoteService.js";
import { createId } from "../../../kernel/id.js";
import type { StartSystemDevSimulationPayload } from "../../ports/infrastructure/db/systemDevSimulation/jobStore.js";
import type { SystemDevSimulationRandom } from "../../../domain/systemDevSimulation/random.js";
import {
  REPLAY_NOTE_COLOR_TOKENS,
  type ReplayNoteColorToken,
} from "@zinuto/shared/replayNoteColors";
import type {
  ReplayNoteAttachmentV1,
  ReplayNoteDocumentV1,
} from "@zinuto/shared/replayNoteDocument";
import { throwIfSystemDevSimulationTaskAborted } from "../taskExecutionState.js";

type Language = ReturnType<typeof import("@zinuto/shared/systemDevSimulationCopy").resolveAppUiLanguage>;

type Candidate = {
  samplePoolId: string;
  samplePoolName: string;
  symbol: string;
  baseTimeframe: StartSystemDevSimulationPayload["enabledSamplePools"][number]["baseTimeframe"];
};

export const createIndependentCustomReplayNotesWorkload = async (params: {
  count: number;
  enabledSamplePools: StartSystemDevSimulationPayload["enabledSamplePools"];
  language: Language;
  maxColorCount: number;
  concurrency: number;
  simulationBatchId: string;
  signal?: AbortSignal;
  runPool: (
    total: number,
    concurrency: number,
    worker: (index: number) => Promise<void>,
  ) => Promise<void>;
  createRandom: (seed: string) => SystemDevSimulationRandom;
  randomCreatedAt: (random: SystemDevSimulationRandom) => string;
  buildSeedMeta: (noteType: "CUSTOM") => {
    reflectionSections: Array<{ key: string }>;
  };
  getReplayNoteBuilderCopy: (language: Language) => {
    customNote: string;
    symbol: string;
    period: string;
    summary: string;
    scenario: string;
    trades: string;
    reflection: string;
  };
  buildDocumentFromReflection: (
    title: string,
    headerLines: string[],
    summaryTitle: string,
    summaryItems: Array<{ label: string; value: string }>,
    reflectionTitle: string,
    reflectionItems: Array<{ label: string; value: string }>,
  ) => ReplayNoteDocumentV1;
  buildSource: (input: { noteType: "CUSTOM" }) => { kind: string; id: string | null };
  buildDefaultTitle: (input: {
    language: Language;
    noteType: "CUSTOM";
    createdAt: string;
  }) => string;
  buildColors: (
    maxColorCount: number,
    seed: string,
    requiredTokens?: readonly ReplayNoteColorToken[],
  ) => ReplayNoteColorToken[];
  shiftIso: (value: string, deltaMs: number) => string;
  randomInt: (
    min: number,
    max: number,
    random: SystemDevSimulationRandom,
  ) => number;
}): Promise<number> => {
  if (params.count <= 0) {
    return 0;
  }
  const candidates: Candidate[] = params.enabledSamplePools.flatMap((pool) =>
    pool.symbols.map((symbol: string) => ({
      samplePoolId: pool.id,
      samplePoolName: pool.name,
      symbol,
      baseTimeframe: pool.baseTimeframe,
    })),
  );
  if (!candidates.length) {
    return 0;
  }

  const noteCopy = params.getReplayNoteBuilderCopy(params.language);
  let createdCount = 0;

  const buildRichCustomDocument = (input: {
    index: number;
    candidate: Candidate;
  }): {
    document: ReplayNoteDocumentV1;
    attachments: ReplayNoteAttachmentV1[];
  } => {
    const capsuleRefId = `custom-capsule-${input.index}`;
    const chartRefId = `custom-chart-${input.index}`;
    const orderedItems = [
      `${noteCopy.summary} ${input.candidate.symbol}`,
      `${noteCopy.trades} ${input.candidate.baseTimeframe}`,
      noteCopy.reflection,
    ];
    const checklistItems = [
      `${noteCopy.symbol} ${input.candidate.symbol}`,
      `${noteCopy.period} ${input.candidate.baseTimeframe}`,
      `${noteCopy.scenario} ${input.candidate.samplePoolName}`,
    ];
    return {
      document: {
        schemaVersion: 1,
        blocks: [
          {
            blockKind: "H1",
            children: [
              {
                inlineKind: "TEXT",
                text: noteCopy.customNote,
              },
            ],
          },
          {
            blockKind: "PARAGRAPH",
            children: [
              {
                inlineKind: "TEXT",
                text: `${input.candidate.symbol} `,
                marks: ["BOLD"],
              },
              {
                inlineKind: "TEXT",
                text:
                  params.language === "zh-CN"
                    ? "先记录结构，再校验执行动作。"
                    : "records structure first, then checks execution.",
                marks: ["HIGHLIGHT"],
              },
              {
                inlineKind: "TEXT",
                text: " ",
              },
              {
                inlineKind: "CAPSULE",
                attachmentRefId: capsuleRefId,
              },
            ],
          },
          {
            blockKind: "QUOTE",
            children: [
              {
                inlineKind: "TEXT",
                text:
                  params.language === "zh-CN"
                    ? "只保留能复用到下一次训练的判断。"
                    : "Keep only judgments that can be reused in the next session.",
                marks: ["ITALIC"],
              },
            ],
          },
          {
            blockKind: "BULLET_LIST",
            items: [
              [{ inlineKind: "TEXT", text: `${noteCopy.symbol} ${input.candidate.symbol}` }],
              [{ inlineKind: "TEXT", text: `${noteCopy.period} ${input.candidate.baseTimeframe}` }],
              [{ inlineKind: "TEXT", text: `${noteCopy.scenario} ${input.candidate.samplePoolName}` }],
            ],
          },
          {
            blockKind: "ORDERED_LIST",
            items: [
              [{ inlineKind: "TEXT", text: orderedItems[0] ?? "" }],
              [{ inlineKind: "TEXT", text: orderedItems[1] ?? "" }],
              [{ inlineKind: "TEXT", text: orderedItems[2] ?? "" }],
            ],
          },
          {
            blockKind: "CHECK_LIST",
            items: [
              {
                checked: true,
                children: [{ inlineKind: "TEXT", text: checklistItems[0] ?? "" }],
              },
              {
                checked: false,
                children: [{ inlineKind: "TEXT", text: checklistItems[1] ?? "" }],
              },
              {
                checked: false,
                children: [{ inlineKind: "TEXT", text: checklistItems[2] ?? "" }],
              },
            ],
          },
          { blockKind: "DIVIDER" },
          { blockKind: "EMBED", attachmentRefId: chartRefId },
        ],
      },
      attachments: [
        {
          attachmentRefId: capsuleRefId,
          kind: "CAPSULE",
          summary: {
            label: "Tag",
            value: `#${input.candidate.baseTimeframe}`,
            tone: "neutral",
          },
          ref: {
            kind: "CUSTOM_NOTE",
            id: null,
          },
          payload: {
            symbol: input.candidate.symbol,
            baseTimeframe: input.candidate.baseTimeframe,
          },
          sortIndex: 0,
        },
        {
          attachmentRefId: chartRefId,
          kind: "CHART_VIEW",
          summary: {
            label: "Chart",
            value: input.candidate.baseTimeframe,
            tone: "neutral",
          },
          ref: {
            kind: "SYMBOL",
            id: input.candidate.symbol,
          },
          payload: {
            displayPeriod: input.candidate.baseTimeframe,
          },
          sortIndex: 1,
        },
      ],
    };
  };

  await params.runPool(params.count, params.concurrency, async (index) => {
    throwIfSystemDevSimulationTaskAborted(params.signal);
    const random = params.createRandom(
      `${params.simulationBatchId}:custom:${index}`,
    );
    const candidate = candidates[index % candidates.length] ?? random.pick(candidates);
    const createdAt = params.randomCreatedAt(random);
    const meta = params.buildSeedMeta("CUSTOM");
    const richContent = buildRichCustomDocument({ index, candidate });
    const contentDocument =
      index % 2 === 0
        ? richContent.document
        : params.buildDocumentFromReflection(
            noteCopy.customNote,
            [
              `${noteCopy.symbol} ${candidate.symbol}`,
              `${noteCopy.period} ${candidate.baseTimeframe}`,
            ],
            noteCopy.summary,
            [
              {
                label: noteCopy.scenario,
                value:
                  params.language === "zh-CN"
                    ? "独立复盘"
                    : "Independent Review",
              },
              {
                label:
                  params.language === "zh-CN"
                    ? "样本池"
                    : "Pool",
                value: candidate.samplePoolName,
              },
            ],
            noteCopy.reflection,
            [
              {
                label: "system",
                value:
                  params.language === "zh-CN"
                    ? `围绕 ${candidate.symbol} 整理本轮复盘里最值得保留的结构、犯错模式与后续动作。`
                    : `Use ${candidate.symbol} as the anchor for an independent note that summarizes the most reusable structure, mistake pattern, and follow-up action from this review.`,
              },
            ],
          );
    const source = params.buildSource({
      noteType: "CUSTOM",
    });

    throwIfSystemDevSimulationTaskAborted(params.signal);
    await createReplayNote({
      id: createId(),
      title: params.buildDefaultTitle({
        language: params.language,
        noteType: "CUSTOM",
        createdAt,
      }),
      type: "CUSTOM",
      contentDocument,
      attachments: index % 2 === 0 ? richContent.attachments : [],
      trainingProjectId: null,
      contextDisplayPeriod: null,
      contextSessionId: null,
      contextCursorIndex: null,
      simulationBatchId: params.simulationBatchId,
      sourceKind: source.kind,
      sourceId: source.id,
      colorTokens: params.buildColors(
        params.maxColorCount,
        `${params.simulationBatchId}:custom-colors:${index}`,
        [REPLAY_NOTE_COLOR_TOKENS[index % REPLAY_NOTE_COLOR_TOKENS.length]!],
      ),
      meta: {
        ...meta,
        reflectionEntries: {
          system: {
            value:
              params.language === "zh-CN"
                ? "提炼这轮复盘里真正可复用的流程，而不是只记录情绪或结论。"
                : "Capture the reusable process from this review instead of storing only emotion or conclusion.",
          },
        },
      },
      createdAt,
      updatedAt: params.shiftIso(
        createdAt,
        params.randomInt(10, 90, random) * 60 * 1000,
      ),
    });
    throwIfSystemDevSimulationTaskAborted(params.signal);
    createdCount += 1;
  });

  return createdCount;
};

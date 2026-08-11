// SPDX-License-Identifier: GPL-3.0-only

import type { BaseTimeframe } from "@/domains/chart/chartPeriods";
import {
  BASE_TIMEFRAME_SECTION_ORDER,
  resolveCompactPoolTitle,
  resolveHallSectionStats,
  type CsvImportCardView,
  type HallSection,
  type HallSectionItem,
  type PoolSettingsRow,
} from "@/workspaces/data/dataConfig/model";

type MutableSection = {
  id: string;
  name: string;
  baseTimeframe: BaseTimeframe;
  items: HallSectionItem[];
};

type BuildHallSectionsParams = {
  baseTimeframeLabels: Record<BaseTimeframe, string>;
  csvImportCardViews: CsvImportCardView[];
  poolSettingsById: Map<string, PoolSettingsRow>;
  poolSettingsRows: PoolSettingsRow[];
};

export const buildHallSections = ({
  baseTimeframeLabels,
  csvImportCardViews,
  poolSettingsById,
  poolSettingsRows,
}: BuildHallSectionsParams): HallSection[] => {
  const sectionMap = new Map<BaseTimeframe, MutableSection>();
  const sectionOrder: BaseTimeframe[] = [];
  const ensureSection = (baseTimeframe: BaseTimeframe): MutableSection => {
    const existing = sectionMap.get(baseTimeframe);
    if (existing) {
      return existing;
    }
    const created: MutableSection = {
      id: baseTimeframe,
      name: baseTimeframeLabels[baseTimeframe],
      baseTimeframe,
      items: [],
    };
    sectionMap.set(baseTimeframe, created);
    sectionOrder.push(baseTimeframe);
    return created;
  };

  const linkedImportCardBySourceId = new Map<string, CsvImportCardView>();
  csvImportCardViews.forEach((card) => {
    const sourceId = String(card.sourceId || "").trim();
    if (!sourceId) {
      return;
    }
    // Import cards retain a short history. The newest card is the only card
    // that may describe the source's current state.
    linkedImportCardBySourceId.set(sourceId, card);
  });
  const consumedCardIds = new Set<string>();

  poolSettingsRows.forEach((pool) => {
    const section = ensureSection(pool.baseTimeframe);
    const poolCompactTitle = resolveCompactPoolTitle(
      pool.name,
      section.name,
      pool.name || baseTimeframeLabels[pool.baseTimeframe],
    );
    const linkedImportCard = linkedImportCardBySourceId.get(pool.id);
    if (!linkedImportCard) {
      section.items.push({
        id: `slot-${pool.id}`,
        type: "READY",
        pool,
        compactTitle: poolCompactTitle,
      });
      return;
    }
    consumedCardIds.add(linkedImportCard.id);
    const linkedCompactTitle = resolveCompactPoolTitle(
      linkedImportCard.poolName,
      section.name,
      poolCompactTitle,
    );
    if (linkedImportCard.phase === "DONE" && pool.status === "READY") {
      section.items.push({
        id: `slot-${pool.id}`,
        type: "READY",
        pool,
        compactTitle: linkedCompactTitle,
      });
      return;
    }
    section.items.push({
      id: `slot-${pool.id}`,
      type: "IMPORT",
      card: linkedImportCard,
      bridgedReadyPool: pool,
      compactTitle: linkedCompactTitle,
    });
  });

  csvImportCardViews.forEach((card) => {
    if (consumedCardIds.has(card.id)) {
      return;
    }
    const sourceId = String(card.sourceId || "").trim();
    if (sourceId && linkedImportCardBySourceId.get(sourceId)?.id !== card.id) {
      return;
    }
    const sourcePool = sourceId ? (poolSettingsById.get(sourceId) ?? null) : null;
    const sectionBaseTimeframe = sourcePool?.baseTimeframe ?? card.baseTimeframe;
    const section = ensureSection(sectionBaseTimeframe);
    section.items.push({
      id: sourceId ? `slot-${sourceId}` : `import-${card.id}`,
      type: "IMPORT",
      card,
      bridgedReadyPool: sourcePool,
      compactTitle: resolveCompactPoolTitle(
        card.poolName,
        section.name,
        card.poolName || baseTimeframeLabels[sectionBaseTimeframe],
      ),
    });
  });

  return sectionOrder
    .map((baseTimeframe) => sectionMap.get(baseTimeframe))
    .filter((section): section is MutableSection => Boolean(section))
    .sort((left, right) => {
      const leftIndex = BASE_TIMEFRAME_SECTION_ORDER.indexOf(left.baseTimeframe);
      const rightIndex = BASE_TIMEFRAME_SECTION_ORDER.indexOf(
        right.baseTimeframe,
      );
      return leftIndex - rightIndex;
    })
    .map((section) => ({
      ...section,
      ...resolveHallSectionStats(section.items),
    }));
};

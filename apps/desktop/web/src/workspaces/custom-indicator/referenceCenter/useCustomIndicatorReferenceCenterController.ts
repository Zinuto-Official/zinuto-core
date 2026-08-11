// SPDX-License-Identifier: GPL-3.0-only

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  getCustomIndicatorReferenceCenterModules,
  resolveCustomIndicatorReferenceCenterEntryModule,
  type CustomIndicatorReferenceCenterCollection,
  type CustomIndicatorReferenceCenterEntryPoint,
  type CustomIndicatorReferenceCenterModule,
  type CustomIndicatorReferenceCenterModuleKey,
  type CustomIndicatorReferenceCenterSearchEntry,
  type CustomIndicatorReferenceCenterTopic,
} from "@/ui/config/customIndicatorReferenceCenter";
import { formatMessage } from "@zinuto/shared/i18n";
import type { AppUiLanguage } from "@/ui/config/uiConfig";
import type { UiLabelEntry } from "@/ui/config/uiLabels";

export const FUNCTIONS_REFERENCE_CENTER_MODULE: CustomIndicatorReferenceCenterModuleKey =
  "functions";
export const DEFAULT_REFERENCE_CENTER_MODULE: CustomIndicatorReferenceCenterModuleKey =
  FUNCTIONS_REFERENCE_CENTER_MODULE;

const normalizeLookup = (value: string): string => value.trim().toUpperCase();

const stringArraysEqual = (
  left: readonly string[],
  right: readonly string[],
): boolean =>
  left.length === right.length &&
  left.every((value, index) => value === right[index]);

const computeTopicSearchScore = (
  entry: CustomIndicatorReferenceCenterSearchEntry,
  normalizedKeyword: string,
): number => {
  if (!normalizedKeyword) {
    return 0;
  }

  if (entry.aliases.some((alias) => alias === normalizedKeyword)) {
    return 0;
  }
  if (entry.title === normalizedKeyword) {
    return 1;
  }
  if (entry.aliases.some((alias) => alias.startsWith(normalizedKeyword))) {
    return 2;
  }
  if (entry.title.startsWith(normalizedKeyword)) {
    return 3;
  }
  if (entry.aliases.some((alias) => alias.includes(normalizedKeyword))) {
    return 4;
  }
  if (entry.keywords.some((keyword) => keyword.includes(normalizedKeyword))) {
    return 5;
  }
  if (
    entry.searchableBlocks.some((block) => block.includes(normalizedKeyword))
  ) {
    return 6;
  }
  return Number.POSITIVE_INFINITY;
};

export const getFirstReferenceTopicId = (
  collections: readonly CustomIndicatorReferenceCenterCollection[],
): string =>
  collections.find((collection) => collection.topicIds.length)?.topicIds[0] ??
  "";

const findCollectionIdForTopic = (
  collections: readonly CustomIndicatorReferenceCenterCollection[],
  topicId: string,
): string =>
  collections.find((collection) => collection.topicIds.includes(topicId))?.id ??
  "";

export const getDefaultExpandedReferenceCollectionIds = ({
  collections,
  selectedTopicId,
}: {
  collections: readonly CustomIndicatorReferenceCenterCollection[];
  selectedTopicId: string;
}): string[] => {
  const selectedCollectionId = findCollectionIdForTopic(
    collections,
    selectedTopicId,
  );

  return [selectedCollectionId || collections[0]?.id || ""].filter(Boolean);
};

export const filterReferenceCollections = ({
  module,
  keyword,
}: {
  module: CustomIndicatorReferenceCenterModule | null;
  keyword: string;
}): readonly CustomIndicatorReferenceCenterCollection[] => {
  if (!module) {
    return [];
  }
  const normalizedKeyword = normalizeLookup(keyword);
  if (!normalizedKeyword) {
    return module.collections;
  }

  return module.collections.reduce<CustomIndicatorReferenceCenterCollection[]>(
    (acc, collection) => {
      const rankedTopicIds = collection.topicIds
        .map((topicId, index) => {
          const searchEntry = module.searchEntryByTopicId.get(topicId);
          if (!searchEntry) {
            return null;
          }
          return {
            topicId,
            index,
            score: computeTopicSearchScore(searchEntry, normalizedKeyword),
          };
        })
        .filter(
          (item): item is { topicId: string; index: number; score: number } =>
            item != null && Number.isFinite(item.score),
        )
        .sort((left, right) => {
          const scoreDelta = left.score - right.score;
          if (scoreDelta !== 0) {
            return scoreDelta;
          }
          return left.index - right.index;
        })
        .map((item) => item.topicId);

      if (!rankedTopicIds.length) {
        return acc;
      }

      acc.push({
        ...collection,
        topicIds: rankedTopicIds,
      });
      return acc;
    },
    [],
  );
};

export const resolveExpandedReferenceCollectionIds = ({
  collections,
  currentExpandedCollectionIds,
  keyword,
}: {
  collections: readonly CustomIndicatorReferenceCenterCollection[];
  currentExpandedCollectionIds: readonly string[];
  keyword: string;
}): string[] => {
  if (!collections.length) {
    return [];
  }

  if (keyword.trim()) {
    return collections.map((collection) => collection.id);
  }

  const visibleCollectionIds = new Set(
    collections.map((collection) => collection.id),
  );
  return currentExpandedCollectionIds.filter((collectionId) =>
    visibleCollectionIds.has(collectionId),
  );
};

type OpenReferenceCenterOptions = {
  entryPoint?: CustomIndicatorReferenceCenterEntryPoint;
  moduleKey?: CustomIndicatorReferenceCenterModuleKey;
  topicId?: string | null;
};

export const useCustomIndicatorReferenceCenterController = ({
  language,
  ui,
}: {
  language: AppUiLanguage;
  ui: UiLabelEntry;
}) => {
  const [isReferenceCenterOpen, setIsReferenceCenterOpen] = useState(false);
  const [activeReferenceCenterModule, setActiveReferenceCenterModuleState] =
    useState<CustomIndicatorReferenceCenterModuleKey>(
      DEFAULT_REFERENCE_CENTER_MODULE,
    );
  const [selectedReferenceTopicId, setSelectedReferenceTopicIdState] =
    useState("");
  const [referenceKeyword, setReferenceKeywordState] = useState("");
  const deferredReferenceKeyword = useDeferredValue(referenceKeyword);
  const [expandedReferenceCollectionIds, setExpandedReferenceCollectionIds] =
    useState<string[]>([]);

  const referenceCenterModules = useMemo(
    () => getCustomIndicatorReferenceCenterModules(language, ui),
    [language, ui],
  );

  const activeReferenceCenterDocModule =
    useMemo<CustomIndicatorReferenceCenterModule | null>(
      () =>
        referenceCenterModules.find(
          (module) => module.key === activeReferenceCenterModule,
        ) ??
        referenceCenterModules[0] ??
        null,
      [activeReferenceCenterModule, referenceCenterModules],
    );

  const filteredReferenceCollections = useMemo<
    readonly CustomIndicatorReferenceCenterCollection[]
  >(
    () =>
      filterReferenceCollections({
        module: activeReferenceCenterDocModule,
        keyword: deferredReferenceKeyword,
      }),
    [activeReferenceCenterDocModule, deferredReferenceKeyword],
  );

  const visibleReferenceTopicIds = useMemo(
    () =>
      filteredReferenceCollections.flatMap((collection) => collection.topicIds),
    [filteredReferenceCollections],
  );

  const activeReferenceCenterTopic =
    useMemo<CustomIndicatorReferenceCenterTopic | null>(() => {
      if (!activeReferenceCenterDocModule) {
        return null;
      }
      return (
        activeReferenceCenterDocModule.topicById.get(
          selectedReferenceTopicId,
        ) ?? null
      );
    }, [activeReferenceCenterDocModule, selectedReferenceTopicId]);

  const activeReferenceCenterRelatedTopics = useMemo(
    () =>
      activeReferenceCenterTopic && activeReferenceCenterDocModule
        ? activeReferenceCenterTopic.relatedTopicIds
            .map((topicId) =>
              activeReferenceCenterDocModule.topicById.get(topicId),
            )
            .filter(
              (topic): topic is CustomIndicatorReferenceCenterTopic =>
                topic != null,
            )
        : [],
    [activeReferenceCenterDocModule, activeReferenceCenterTopic],
  );

  useEffect(() => {
    if (!referenceCenterModules.length) {
      return;
    }
    if (
      referenceCenterModules.some(
        (module) => module.key === activeReferenceCenterModule,
      )
    ) {
      return;
    }
    setActiveReferenceCenterModuleState(
      referenceCenterModules[0]?.key ?? DEFAULT_REFERENCE_CENTER_MODULE,
    );
  }, [activeReferenceCenterModule, referenceCenterModules]);

  useEffect(() => {
    if (!visibleReferenceTopicIds.length) {
      if (selectedReferenceTopicId) {
        setSelectedReferenceTopicIdState("");
      }
      if (expandedReferenceCollectionIds.length) {
        setExpandedReferenceCollectionIds([]);
      }
      return;
    }

    const nextSelectedTopicId = visibleReferenceTopicIds.includes(
      selectedReferenceTopicId,
    )
      ? selectedReferenceTopicId
      : (visibleReferenceTopicIds[0] ?? "");

    if (nextSelectedTopicId !== selectedReferenceTopicId) {
      setSelectedReferenceTopicIdState(nextSelectedTopicId);
    }

    const nextExpandedCollectionIds = resolveExpandedReferenceCollectionIds({
      collections: filteredReferenceCollections,
      currentExpandedCollectionIds: expandedReferenceCollectionIds,
      keyword: deferredReferenceKeyword,
    });

    if (
      !stringArraysEqual(
        nextExpandedCollectionIds,
        expandedReferenceCollectionIds,
      )
    ) {
      setExpandedReferenceCollectionIds(nextExpandedCollectionIds);
    }
  }, [
    expandedReferenceCollectionIds,
    filteredReferenceCollections,
    deferredReferenceKeyword,
    selectedReferenceTopicId,
    visibleReferenceTopicIds,
  ]);

  const referenceSelectionHint = deferredReferenceKeyword.trim()
    ? formatMessage(language, "appText.result")
    : (activeReferenceCenterDocModule?.overview ??
      ui.customIndicatorRulesUsage);

  const setReferenceKeyword = useCallback((keyword: string) => {
    setReferenceKeywordState(keyword);
  }, []);

  const setSelectedReferenceTopicId = useCallback(
    (topicId: string) => {
      setSelectedReferenceTopicIdState(topicId);
      const collectionId = findCollectionIdForTopic(
        activeReferenceCenterDocModule?.collections ?? [],
        topicId,
      );
      if (!collectionId) {
        return;
      }
      setExpandedReferenceCollectionIds((current) =>
        current.includes(collectionId) ? current : [...current, collectionId],
      );
    },
    [activeReferenceCenterDocModule],
  );

  const toggleReferenceCollection = useCallback(
    (collectionId: string) => {
      if (referenceKeyword.trim()) {
        return;
      }
      setExpandedReferenceCollectionIds((current) => {
        if (current.includes(collectionId)) {
          return current.filter((item) => item !== collectionId);
        }
        return [...current, collectionId];
      });
    },
    [referenceKeyword],
  );

  const expandAllReferenceCollections = useCallback(() => {
    if (referenceKeyword.trim()) {
      return;
    }
    setExpandedReferenceCollectionIds(
      activeReferenceCenterDocModule?.collections.map(
        (collection) => collection.id,
      ) ?? [],
    );
  }, [activeReferenceCenterDocModule, referenceKeyword]);

  const collapseAllReferenceCollections = useCallback(() => {
    if (referenceKeyword.trim()) {
      return;
    }
    setExpandedReferenceCollectionIds([]);
  }, [referenceKeyword]);

  const openReferenceCenter = useCallback(
    ({
      entryPoint = "default",
      moduleKey,
      topicId,
    }: OpenReferenceCenterOptions = {}) => {
      const nextModuleKey =
        moduleKey ??
        (topicId
          ? referenceCenterModules.find((module) =>
              module.topics.some((topic) => topic.id === topicId),
            )?.key
          : null) ??
        resolveCustomIndicatorReferenceCenterEntryModule(entryPoint);
      const targetModule =
        referenceCenterModules.find((module) => module.key === nextModuleKey) ??
        referenceCenterModules[0] ??
        null;
      const nextTopicId =
        topicId && targetModule?.topics.some((topic) => topic.id === topicId)
          ? topicId
          : getFirstReferenceTopicId(targetModule?.collections ?? []);

      setActiveReferenceCenterModuleState(targetModule?.key ?? nextModuleKey);
      setReferenceKeywordState("");
      setSelectedReferenceTopicIdState(nextTopicId);
      setExpandedReferenceCollectionIds(
        nextTopicId
          ? getDefaultExpandedReferenceCollectionIds({
              collections: targetModule?.collections ?? [],
              selectedTopicId: nextTopicId,
            })
          : [],
      );
      setIsReferenceCenterOpen(true);
    },
    [referenceCenterModules],
  );

  return {
    activeReferenceCenterDocModule,
    activeReferenceCenterRelatedTopics,
    activeReferenceCenterTopic,
    collapseAllReferenceCollections,
    expandedReferenceCollectionIds,
    expandAllReferenceCollections,
    filteredReferenceCollections,
    isReferenceSearchPending: referenceKeyword !== deferredReferenceKeyword,
    isReferenceCenterOpen,
    openReferenceCenter,
    referenceKeyword,
    referenceSelectionHint,
    selectedReferenceTopicId,
    setIsReferenceCenterOpen,
    setReferenceKeyword,
    setSelectedReferenceTopicId,
    toggleReferenceCollection,
  };
};

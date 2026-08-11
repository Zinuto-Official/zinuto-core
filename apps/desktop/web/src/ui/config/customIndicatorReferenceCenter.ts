// SPDX-License-Identifier: GPL-3.0-only

import {
  getCustomIndicatorRuleDocs,
  normalizeCustomIndicatorRuleDocText,
  type AppUiLanguage,
  type CustomIndicatorRuleDocAvailability,
  type CustomIndicatorRuleDocEntry,
  type CustomIndicatorRuleDocExampleGuide,
  type CustomIndicatorRuleDocExampleKind,
  type CustomIndicatorRuleDocModuleKey,
  type CustomIndicatorRuleDocPreviewStyle,
  type CustomIndicatorRuleDocSection,
} from "@/ui/config/uiConfig";
import type { UiLabelEntry } from "@/ui/config/uiLabels";

export type CustomIndicatorReferenceCenterModuleKey =
  CustomIndicatorRuleDocModuleKey;

export type CustomIndicatorReferenceCenterEntryPoint =
  | "default"
  | "troubleshoot";

export type CustomIndicatorReferenceCenterCollection = Readonly<{
  id: string;
  moduleKey: CustomIndicatorReferenceCenterModuleKey;
  label: string;
  summary: string;
  topicIds: readonly string[];
}>;

export type CustomIndicatorReferenceCenterTopic = Readonly<{
  id: string;
  moduleKey: CustomIndicatorReferenceCenterModuleKey;
  collectionId: string;
  collectionLabel: string;
  title: string;
  summary: string;
  description: string;
  formula: string;
  example: string;
  exampleGuide: CustomIndicatorRuleDocExampleGuide | null;
  exampleKind: CustomIndicatorRuleDocExampleKind;
  availability: CustomIndicatorRuleDocAvailability;
  useWhen: string;
  commonMistake: string;
  keywords: readonly string[];
  aliases: readonly string[];
  relatedTopicIds: readonly string[];
  previewStyle?: CustomIndicatorRuleDocPreviewStyle;
  runnableScript?: boolean;
}>;

export type CustomIndicatorReferenceCenterSearchEntry = Readonly<{
  aliases: readonly string[];
  title: string;
  keywords: readonly string[];
  searchableBlocks: readonly string[];
}>;

export type CustomIndicatorReferenceCenterModule = Readonly<{
  key: CustomIndicatorReferenceCenterModuleKey;
  label: string;
  overview: string;
  supportsSearch: boolean;
  collections: readonly CustomIndicatorReferenceCenterCollection[];
  topics: readonly CustomIndicatorReferenceCenterTopic[];
  topicById: ReadonlyMap<string, CustomIndicatorReferenceCenterTopic>;
  searchEntryByTopicId: ReadonlyMap<
    string,
    CustomIndicatorReferenceCenterSearchEntry
  >;
}>;

export const CUSTOM_INDICATOR_REFERENCE_CENTER_MODULE_ORDER = Object.freeze<
  readonly CustomIndicatorReferenceCenterModuleKey[]
>(["functions"]);

const normalizeText = (value: string): string =>
  normalizeCustomIndicatorRuleDocText(value).replace(/\s+/g, " ").trim();

const normalizeCodeBlock = (value: string): string =>
  normalizeCustomIndicatorRuleDocText(value);

const normalizeExampleGuide = (
  guide: CustomIndicatorRuleDocExampleGuide | undefined,
): CustomIndicatorRuleDocExampleGuide | null => {
  if (!guide) {
    return null;
  }
  const steps = guide.steps.map((step) => ({
    title: normalizeText(step.title),
    code: normalizeCodeBlock(step.code),
    paragraphs: step.paragraphs.map(normalizeText).filter(Boolean),
  }));
  const useCases = guide.useCases?.map(normalizeText).filter(Boolean);

  return {
    overview: normalizeText(guide.overview),
    steps,
    result: normalizeText(guide.result),
    ...(useCases?.length ? { useCases } : {}),
  };
};

const exampleGuideSearchText = (
  guide: CustomIndicatorRuleDocExampleGuide | undefined,
): string[] => {
  if (!guide) {
    return [];
  }

  return [
    guide.overview,
    ...guide.steps.flatMap((step) => [
      step.title,
      step.code,
      ...step.paragraphs,
    ]),
    guide.result,
    ...(guide.useCases ?? []),
  ];
};

const splitAliases = (value: string): string[] => {
  const normalized = value.trim();
  if (normalized === "/") {
    return [normalized];
  }
  return normalized
    .split("/")
    .map((item) => item.trim())
    .filter(Boolean);
};

const normalizeLookupToken = (value: string): string =>
  normalizeText(value).toUpperCase();

const toCollectionId = (
  moduleKey: CustomIndicatorReferenceCenterModuleKey,
  sectionId: string,
): string => `${moduleKey}::${sectionId}`;

const toTopicId = (
  moduleKey: CustomIndicatorReferenceCenterModuleKey,
  sectionId: string,
  entryId: string,
): string => `${moduleKey}::${sectionId}::${entryId}`;

const extractReferenceTokens = (value: string): string[] =>
  Array.from(
    new Set(
      Array.from(
        normalizeCodeBlock(value).matchAll(/\b[A-Z][A-Z0-9_]{1,}\b/g),
        (match) => match[0],
      ),
    ),
  );

const buildTopicKeywords = (
  entry: CustomIndicatorRuleDocEntry,
  aliases: readonly string[],
  section: CustomIndicatorRuleDocSection,
): string[] =>
  Array.from(
    new Set(
      [
        ...aliases,
        ...(entry.keywords ?? []),
        entry.summary ?? "",
        ...exampleGuideSearchText(entry.exampleGuide),
        section.title,
        section.summary,
        entry.useWhen ?? "",
        entry.commonMistake ?? "",
      ]
        .map((item) => normalizeText(item))
        .filter(Boolean),
    ),
  );

const buildModuleTopics = ({
  moduleKey,
  sections,
}: {
  moduleKey: CustomIndicatorReferenceCenterModuleKey;
  sections: readonly CustomIndicatorRuleDocSection[];
}): {
  collections: CustomIndicatorReferenceCenterCollection[];
  topics: CustomIndicatorReferenceCenterTopic[];
} => {
  const collections: CustomIndicatorReferenceCenterCollection[] = [];
  const topics: CustomIndicatorReferenceCenterTopic[] = [];

  sections.forEach((section) => {
    const collectionId = toCollectionId(moduleKey, section.id);
    const sectionTopicIds = section.entries.map((entry) =>
      toTopicId(moduleKey, section.id, entry.id),
    );
    collections.push({
      id: collectionId,
      moduleKey,
      label: section.title,
      summary: normalizeText(section.summary),
      topicIds: sectionTopicIds,
    });
    section.entries.forEach((entry) => {
      const aliases = splitAliases(entry.title);
      topics.push({
        id: toTopicId(moduleKey, section.id, entry.id),
        moduleKey,
        collectionId,
        collectionLabel: section.title,
        title: entry.title,
        summary: normalizeText(entry.summary ?? ""),
        description: normalizeText(entry.description ?? ""),
        formula: normalizeCodeBlock(entry.formula),
        example: normalizeCodeBlock(entry.example),
        exampleGuide: normalizeExampleGuide(entry.exampleGuide),
        exampleKind: entry.exampleKind ?? "code",
        availability: entry.availability ?? "available",
        useWhen: normalizeText(entry.useWhen ?? ""),
        commonMistake: normalizeText(entry.commonMistake ?? ""),
        keywords: buildTopicKeywords(entry, aliases, section),
        aliases,
        relatedTopicIds: [],
        previewStyle: entry.previewStyle,
        runnableScript: entry.runnableScript,
      });
    });
  });

  return {
    collections,
    topics,
  };
};

const attachTopicRelations = (
  module: Omit<
    CustomIndicatorReferenceCenterModule,
    "topics" | "topicById" | "searchEntryByTopicId"
  > & {
    topics: readonly Omit<CustomIndicatorReferenceCenterTopic, "relatedTopicIds">[];
  },
): CustomIndicatorReferenceCenterModule => {
  const aliasIndex = new Map<string, string[]>();

  module.topics.forEach((topic) => {
    topic.aliases.forEach((alias) => {
      const lookup = normalizeLookupToken(alias);
      if (!lookup) {
        return;
      }
      const hits = aliasIndex.get(lookup);
      if (hits) {
        hits.push(topic.id);
        return;
      }
      aliasIndex.set(lookup, [topic.id]);
    });
  });

  const topics = module.topics.map((topic) => {
    const relatedTopicIds: string[] = [];
    const seenTopicIds = new Set<string>([topic.id]);
    const referenceTokens = [
      ...extractReferenceTokens(topic.formula),
      ...extractReferenceTokens(topic.example),
      ...topic.keywords.map(normalizeLookupToken),
    ];

    referenceTokens.forEach((token) => {
      const matches = aliasIndex.get(token) ?? [];
      matches.forEach((topicId) => {
        if (seenTopicIds.has(topicId)) {
          return;
        }
        relatedTopicIds.push(topicId);
        seenTopicIds.add(topicId);
      });
    });

    if (relatedTopicIds.length < 4) {
      module.topics
        .filter(
          (candidate) =>
            candidate.collectionId === topic.collectionId &&
            !seenTopicIds.has(candidate.id),
        )
        .forEach((candidate) => {
          if (relatedTopicIds.length >= 4) {
            return;
          }
          relatedTopicIds.push(candidate.id);
          seenTopicIds.add(candidate.id);
        });
    }

    return {
      ...topic,
      relatedTopicIds,
    };
  });

  const topicById = new Map(topics.map((topic) => [topic.id, topic]));
  const searchEntryByTopicId = new Map(
    topics.map((topic) => [
      topic.id,
      {
        aliases: topic.aliases.map(normalizeLookupToken),
        title: normalizeLookupToken(topic.title),
        keywords: topic.keywords.map(normalizeLookupToken),
        searchableBlocks: [
          topic.summary,
          topic.description,
          topic.formula,
          topic.example,
          topic.useWhen,
          topic.commonMistake,
        ].map(normalizeLookupToken),
      },
    ]),
  );

  return {
    ...module,
    topics,
    topicById,
    searchEntryByTopicId,
  };
};

const buildModule = ({
  key,
  label,
  overview,
  sections,
}: {
  key: CustomIndicatorReferenceCenterModuleKey;
  label: string;
  overview: string;
  sections: readonly CustomIndicatorRuleDocSection[];
}): CustomIndicatorReferenceCenterModule =>
  attachTopicRelations({
    key,
    label,
    overview,
    supportsSearch: true,
    ...buildModuleTopics({
      moduleKey: key,
      sections,
    }),
  });

export const resolveCustomIndicatorReferenceCenterEntryModule = (
  _entryPoint: CustomIndicatorReferenceCenterEntryPoint,
): CustomIndicatorReferenceCenterModuleKey =>
  "functions";

export const getCustomIndicatorReferenceCenterModules = (
  language: AppUiLanguage,
  ui: UiLabelEntry,
): readonly CustomIndicatorReferenceCenterModule[] => {
  const sourceModules = getCustomIndicatorRuleDocs(language);
  const sourceModuleByKey = new Map(
    sourceModules.map((module) => [module.key, module]),
  );
  const labelByModuleKey: Record<CustomIndicatorReferenceCenterModuleKey, string> = {
    examples: ui.customIndicatorRulesModuleExamples,
    syntax: ui.customIndicatorRulesModuleSyntax,
    plot: ui.customIndicatorRulesModulePlot,
    fields: ui.customIndicatorRulesModuleFields,
    functions: ui.customIndicatorRulesModuleFunctions,
  };

  return CUSTOM_INDICATOR_REFERENCE_CENTER_MODULE_ORDER
    .map((key) => {
      const sourceModule = sourceModuleByKey.get(key);
      if (!sourceModule) {
        return null;
      }
      return buildModule({
        key,
        label: labelByModuleKey[key],
        overview:
          key === "functions"
            ? ui.customIndicatorReferenceCenterFunctionsOverview
            : sourceModule.overview,
        sections: sourceModule.sections,
      });
    })
    .filter(
      (module): module is CustomIndicatorReferenceCenterModule =>
        module != null,
    );
};

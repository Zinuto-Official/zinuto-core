// SPDX-License-Identifier: GPL-3.0-only

import {
  getCustomIndicatorReferenceCenterModules,
  type CustomIndicatorReferenceCenterTopic,
} from "@/ui/config/customIndicatorReferenceCenter";
import { api } from "@/api";
import {
  getCustomIndicatorAiConversionGuideCopy,
  normalizeCustomIndicatorRuleDocText,
  type AppUiLanguage,
  type CustomIndicatorRuleDocAvailability,
} from "@/ui/config/uiConfig";
import type { UiLabelEntry } from "@/ui/config/uiLabels";

const GUIDE_MIME_TYPE = "text/plain;charset=utf-8";
export const CUSTOM_INDICATOR_AI_GUIDE_MINIMAL_TEMPLATE =
  "N := 20;\nMID: MA(C, N), COLOR60A5FA, LINETHICK2;";

const normalizeInlineText = (value: string): string =>
  normalizeCustomIndicatorRuleDocText(value).replace(/\s+/g, " ").trim();

const formatBullet = (value: string): string =>
  `- ${normalizeInlineText(value)}`;

const isAvailableTopic = (
  topic: CustomIndicatorReferenceCenterTopic,
): boolean => topic.availability === "available";

const formatAvailableTopicLine = (
  topic: CustomIndicatorReferenceCenterTopic,
): string =>
  `- ${normalizeInlineText(topic.title)}: ${normalizeInlineText(
    topic.formula,
  )} | ${normalizeInlineText(topic.summary)}`;

const formatUnavailableTopicLine = (
  topic: CustomIndicatorReferenceCenterTopic,
  availabilityLabels: Record<CustomIndicatorRuleDocAvailability, string>,
): string => {
  const reason = normalizeInlineText(topic.description || topic.summary);
  const availability =
    availabilityLabels[topic.availability] ?? topic.availability;

  return `- ${normalizeInlineText(topic.title)}: ${availability} | ${reason}`;
};

export const buildCustomIndicatorAiConversionGuideFilename = (
  language: AppUiLanguage,
): string => `zinuto-indicator-ai-guide-${language}.txt`;

export const buildCustomIndicatorAiConversionGuideText = (
  language: AppUiLanguage,
  ui: UiLabelEntry,
): string => {
  const copy = getCustomIndicatorAiConversionGuideCopy(language);
  const referenceModule =
    getCustomIndicatorReferenceCenterModules(language, ui).find(
      (module) => module.key === "functions",
    ) ?? null;
  const topicById = new Map(
    (referenceModule?.topics ?? []).map((topic) => [topic.id, topic]),
  );
  const unavailableTopics: CustomIndicatorReferenceCenterTopic[] = [];
  const lines: string[] = [
    copy.title,
    "",
    normalizeInlineText(copy.summary),
    "",
    ...copy.instructions.map(normalizeInlineText),
    "",
    `${copy.indicatorSystemTitle}:`,
    ...copy.indicatorSystemItems.map(formatBullet),
    "",
    `${copy.drawingTitle}:`,
    ...copy.drawingItems.map(formatBullet),
    "",
    `${copy.exampleTitle}:`,
    ...CUSTOM_INDICATOR_AI_GUIDE_MINIMAL_TEMPLATE.split("\n"),
    "",
    `${copy.functionIndexTitle}:`,
  ];

  referenceModule?.collections.forEach((collection) => {
    lines.push("", `[${collection.label}]`);

    collection.topicIds.forEach((topicId) => {
      const topic = topicById.get(topicId);
      if (!topic) {
        return;
      }

      if (isAvailableTopic(topic)) {
        lines.push(formatAvailableTopicLine(topic));
        return;
      }

      unavailableTopics.push(topic);
    });
  });

  lines.push("", `${copy.unavailableTitle}:`);
  unavailableTopics.forEach((topic) => {
    lines.push(formatUnavailableTopicLine(topic, copy.availabilityLabels));
  });

  return `${lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd()}\n`;
};

export const writeCustomIndicatorReferenceTextToClipboard = async (
  content: string,
): Promise<boolean> => {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(content);
      return true;
    } catch {
      // Fall through to the local textarea path for restricted WebViews.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = content;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  return copied;
};

export const downloadCustomIndicatorAiConversionGuide = (
  language: AppUiLanguage,
  ui: UiLabelEntry,
): Promise<boolean> => {
  const content = buildCustomIndicatorAiConversionGuideText(language, ui);

  return api
    .saveCustomIndicatorAiConversionGuide({ language, content })
    .then((result) => {
      if (result !== null) {
        return result === "SAVED";
      }

      const blob = new Blob([content], { type: GUIDE_MIME_TYPE });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");

      anchor.href = url;
      anchor.download = buildCustomIndicatorAiConversionGuideFilename(language);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      return true;
    });
};

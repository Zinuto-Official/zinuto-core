// SPDX-License-Identifier: GPL-3.0-only

import { loadLocaleCatalog } from "@zinuto/shared/i18n";
import {
  REPLAY_DRAW_TOOL_EXCLUDED_NATIVE_NAMES,
  REPLAY_DRAW_TOOL_INTERNAL_NAMES,
  REPLAY_DRAW_TOOL_PREFERRED_ORDER,
} from "@zinuto/shared/replayDrawingTools";
import type { AppUiLanguage } from "@/ui/config/uiConfig";

export const DRAW_TOOL_INTERNAL_NAMES = new Set<string>(
  REPLAY_DRAW_TOOL_INTERNAL_NAMES,
);

export const DRAW_TOOL_EXCLUDED_NATIVE_NAMES = new Set<string>(
  REPLAY_DRAW_TOOL_EXCLUDED_NATIVE_NAMES,
);

export const DRAW_TOOL_PREFERRED_ORDER: string[] = [
  ...REPLAY_DRAW_TOOL_PREFERRED_ORDER,
];

const DRAW_TOOL_LABEL_LOCALES: readonly AppUiLanguage[] = [
  "en",
  "zh-CN",
  "ja",
  "ko",
  "es",
];

const readDrawToolLabels = (
  language: AppUiLanguage,
): Record<string, string> => {
  const catalog = loadLocaleCatalog(language, "uiConfig" as never) as Record<
    string,
    string
  >;
  const raw = catalog["drawToolLabels.bundle"] ?? "";
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
};

export const DRAW_TOOL_LABELS: Record<
  AppUiLanguage,
  Record<string, string>
> = new Proxy({} as Record<AppUiLanguage, Record<string, string>>, {
  get: (target, property) => {
    if (
      typeof property !== "string" ||
      !DRAW_TOOL_LABEL_LOCALES.includes(property as AppUiLanguage)
    ) {
      return undefined;
    }
    const language = property as AppUiLanguage;
    if (!Object.prototype.hasOwnProperty.call(target, language)) {
      target[language] = readDrawToolLabels(language);
    }
    return target[language];
  },
});

export const TRAINER_SHORTCUT_KEYS = {
  buy: "b",
  sell: "s",
  addNote: "n",
  autoPlay: "k",
} as const;

const DRAW_SHORTCUT_RESERVED_KEYS = new Set<string>([
  TRAINER_SHORTCUT_KEYS.buy,
  TRAINER_SHORTCUT_KEYS.sell,
  TRAINER_SHORTCUT_KEYS.addNote,
  TRAINER_SHORTCUT_KEYS.autoPlay,
]);

const DRAW_SHORTCUT_OVERRIDE_BY_TOOL: Record<string, string> = {
  cursor: "c",
  straightLine: "l",
  rayLine: "r",
  segment: "e",
  horizontalStraightLine: "h",
  horizontalRayLine: "y",
  horizontalSegment: "m",
  verticalStraightLine: "v",
  parallelStraightLine: "p",
  priceChannelLine: "i",
  fibonacciLine: "f",
  priceLine: "q",
  simpleAnnotation: "a",
};

const pushShortcutCandidate = (target: string[], raw: string): void => {
  const normalized = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!/^[a-z]$/.test(normalized) || target.includes(normalized)) {
    return;
  }
  target.push(normalized);
};

const splitToolNameWords = (toolName: string): string[] =>
  toolName
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

const collectToolNameShortcutCandidates = (toolName: string): string[] => {
  const words = splitToolNameWords(toolName);
  const candidates: string[] = [];

  for (const word of words) {
    pushShortcutCandidate(candidates, word.slice(0, 1));
  }
  for (const word of words) {
    for (const char of word.slice(1)) {
      pushShortcutCandidate(candidates, char);
    }
  }
  for (const word of words) {
    for (const char of word) {
      pushShortcutCandidate(candidates, char);
    }
  }

  return candidates;
};

export const buildDrawShortcutByTool = (
  tools: string[],
): Record<string, string> => {
  const usedKeys = new Set<string>(DRAW_SHORTCUT_RESERVED_KEYS);
  const mapping: Record<string, string> = {};

  for (const tool of tools) {
    const toolName = String(tool);
    const candidates: string[] = [];

    pushShortcutCandidate(
      candidates,
      DRAW_SHORTCUT_OVERRIDE_BY_TOOL[toolName] ?? "",
    );
    for (const candidate of collectToolNameShortcutCandidates(toolName)) {
      pushShortcutCandidate(candidates, candidate);
    }

    const picked = candidates.find((candidate) => !usedKeys.has(candidate));
    if (!picked) {
      continue;
    }

    mapping[toolName] = picked;
    usedKeys.add(picked);
  }

  return mapping;
};

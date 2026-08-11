// SPDX-License-Identifier: GPL-3.0-only

export const DEFAULT_SIMULATION_REPLAY_NOTE_TITLE_PREFIXES = Object.freeze([
  "SIM-REPLAY-NOTE",
  "SIM-CHALLENGE-NOTE",
  "SIM-CUSTOM",
] as const);

const normalizeSimulationText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const normalizeTitlePrefix = (value: unknown): string =>
  normalizeSimulationText(value).toUpperCase();

export const hasSimulationTitlePrefix = (
  title: unknown,
  prefixes: readonly string[] = DEFAULT_SIMULATION_REPLAY_NOTE_TITLE_PREFIXES,
): boolean => {
  const normalizedTitle = normalizeSimulationText(title).toUpperCase();
  if (!normalizedTitle) {
    return false;
  }
  return prefixes.some((prefix) => {
    const normalizedPrefix = normalizeTitlePrefix(prefix);
    return normalizedPrefix && normalizedTitle.startsWith(normalizedPrefix);
  });
};

export const isSimulationTrainingProjectRecord = (input: {
  sourceTag?: unknown;
  referencedBySimulationNote?: boolean;
  title?: unknown;
  titlePrefixes?: readonly string[];
}): boolean =>
  Boolean(
    normalizeSimulationText(input.sourceTag) ||
      input.referencedBySimulationNote ||
      hasSimulationTitlePrefix(
        input.title,
        input.titlePrefixes ?? DEFAULT_SIMULATION_REPLAY_NOTE_TITLE_PREFIXES,
      ),
  );

export const isSimulationReplayNoteRecord = (input: {
  sourceKind?: unknown;
  linkedTrainingProjectIsSimulation?: boolean;
  title?: unknown;
  titlePrefixes?: readonly string[];
}): boolean =>
  Boolean(
    normalizeSimulationText(input.sourceKind) ||
      input.linkedTrainingProjectIsSimulation ||
      hasSimulationTitlePrefix(
        input.title,
        input.titlePrefixes ?? DEFAULT_SIMULATION_REPLAY_NOTE_TITLE_PREFIXES,
      ),
  );

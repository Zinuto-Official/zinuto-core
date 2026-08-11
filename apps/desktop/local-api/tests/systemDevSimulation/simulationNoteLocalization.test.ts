// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPopulatedReflectionSections,
  buildSpecialTrainingReflectionEntries,
  formatSimulationProfitFactor,
} from "../../src/application/systemDevSimulation/simulationNoteReflections.js";

const languages = ["zh-CN", "en", "ja", "ko", "es"] as const;

test("simulation note profit factor never uses a fake finite cap", () => {
  assert.equal(
    formatSimulationProfitFactor(null, "POSITIVE_INFINITY", "N/A"),
    "∞",
  );
  assert.equal(
    formatSimulationProfitFactor(null, "NOT_AVAILABLE", "N/A"),
    "N/A",
  );
  assert.equal(formatSimulationProfitFactor(1.234, "FINITE", "N/A"), "1.23");
});

test("simulation challenge notes localize headings and omit empty reflection sections", () => {
  for (const language of languages) {
    const reflectionEntries = buildSpecialTrainingReflectionEntries({
      modeId: "fast-decision-training",
      language,
    });
    const sections = buildPopulatedReflectionSections({
      language,
      reflectionSections: [
        { key: "speedAssessment" },
        { key: "instinctCheck" },
        { key: "riskReflection" },
        { key: "recoveryAction" },
      ],
      reflectionEntries,
    });

    assert.deepEqual(
      sections.map((section) => section.label),
      sections.map((section) => section.label.trim()),
    );
    assert.equal(sections.length, 2);
    assert.ok(sections.every((section) => section.value.length > 0));
    assert.ok(
      sections.every(
        (section) =>
          section.label !== "speedAssessment" &&
          section.label !== "instinctCheck",
      ),
    );
  }
});

test("simulation risk reflections never expose internal outcome bucket codes", () => {
  for (const language of languages) {
    const reflectionEntries = buildSpecialTrainingReflectionEntries({
      modeId: "risk-discipline-training",
      language,
    });
    const serialized = JSON.stringify(reflectionEntries);
    assert.equal(serialized.includes("ADD_AND_HOLD"), false);

    const sections = buildPopulatedReflectionSections({
      language,
      reflectionSections: [
        { key: "speedAssessment" },
        { key: "instinctCheck" },
        { key: "riskReflection" },
        { key: "recoveryAction" },
      ],
      reflectionEntries,
    });
    assert.equal(sections.length, 4);
    assert.ok(
      sections.every(
        (section) =>
          section.value.length > 0 &&
          ![
            "speedAssessment",
            "instinctCheck",
            "riskReflection",
            "recoveryAction",
          ].includes(section.label),
      ),
    );
  }
});

test("simulation free-replay notes reuse localized structured-reflection labels", () => {
  for (const language of languages) {
    const sections = buildPopulatedReflectionSections({
      language,
      reflectionSections: [
        { key: "marketFacts" },
        { key: "executionAssessment" },
        { key: "nextAction" },
        { key: "emotionState" },
      ],
      reflectionEntries: {
        marketFacts: { value: "fact" },
        executionAssessment: { value: "execution" },
        nextAction: { value: "next" },
        emotionState: { value: "emotion" },
      },
    });

    assert.equal(sections.length, 4);
    assert.ok(
      sections.every(
        (section) =>
          ![
            "marketFacts",
            "executionAssessment",
            "nextAction",
            "emotionState",
          ].includes(section.label),
      ),
    );
  }
});

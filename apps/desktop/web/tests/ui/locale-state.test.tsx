// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveInitialUiLanguagePreference,
  resolveNextUiLanguagePreference,
  type UiLanguageStorage,
} from "../../src/frontend-kernel/i18n/localeState";

const UI_LANGUAGE_STORAGE_KEY = "zinuto:ui-language";
const UI_LANGUAGE_SOURCE_STORAGE_KEY = "zinuto:ui-language-source";

const withNavigatorLanguages = async (
  languages: readonly string[],
  run: () => Promise<void> | void,
) => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      language: languages[0] ?? "en-US",
      languages,
    },
  });
  try {
    await run();
  } finally {
    if (descriptor) {
      Object.defineProperty(globalThis, "navigator", descriptor);
    } else {
      Reflect.deleteProperty(globalThis, "navigator");
    }
  }
};

const createStorage = (
  entries: Record<string, string | null>,
): UiLanguageStorage => ({
  getItem: (key) => entries[key] ?? null,
  setItem: (key, value) => {
    entries[key] = value;
  },
});

test("manual language storage wins over navigator language", async () => {
  await withNavigatorLanguages(["ko-KR", "en-US"], () => {
    assert.deepEqual(
      resolveInitialUiLanguagePreference(
        createStorage({
          [UI_LANGUAGE_STORAGE_KEY]: "ja",
          [UI_LANGUAGE_SOURCE_STORAGE_KEY]: "USER",
        }),
      ),
      {
        language: "ja",
        source: "USER",
      },
    );
  });
});

test("stored language without source is treated as an existing user preference", async () => {
  await withNavigatorLanguages(["ko-KR", "en-US"], () => {
    assert.deepEqual(
      resolveInitialUiLanguagePreference(
        createStorage({
          [UI_LANGUAGE_STORAGE_KEY]: "ja",
        }),
      ),
      {
        language: "ja",
        source: "USER",
      },
    );
  });
});

test("stored system language follows navigator language", async () => {
  await withNavigatorLanguages(["ko-KR", "en-US"], () => {
    assert.deepEqual(
      resolveInitialUiLanguagePreference(
        createStorage({
          [UI_LANGUAGE_STORAGE_KEY]: "ja",
          [UI_LANGUAGE_SOURCE_STORAGE_KEY]: "SYSTEM",
        }),
      ),
      {
        language: "ko",
        source: "SYSTEM",
      },
    );
  });
});

test("system language updates cannot override a manual language preference", () => {
  assert.equal(
    resolveNextUiLanguagePreference({
      currentSource: "USER",
      requestedLanguage: "ko",
      requestedSource: "SYSTEM",
    }),
    null,
  );

  assert.deepEqual(
    resolveNextUiLanguagePreference({
      currentSource: "USER",
      requestedLanguage: "es",
      requestedSource: "USER",
    }),
    {
      language: "es",
      source: "USER",
    },
  );
});

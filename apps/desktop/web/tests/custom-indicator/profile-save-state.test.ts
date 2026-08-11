// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readCustomIndicatorPageSource = (): string =>
  readFileSync(
    new URL(
      "../../src/workspaces/custom-indicator/customIndicatorWorkbenchEditorState.tsx",
      import.meta.url,
    ),
    "utf8",
  );
const readCustomIndicatorStateSource = (): string =>
  readFileSync(
    new URL(
      "../../src/workspaces/custom-indicator/customIndicatorWorkbenchState.ts",
      import.meta.url,
    ),
    "utf8",
  );
const readCustomIndicatorLayoutSource = (): string =>
  readFileSync(
    new URL(
      "../../src/workspaces/custom-indicator/CustomIndicatorWorkbenchLayout.tsx",
      import.meta.url,
    ),
    "utf8",
  );

const sliceSaveCurrentIndicatorHandler = (source: string): string => {
  const start = source.indexOf("  const saveCurrentIndicator = useCallback(async () => {");
  assert.notEqual(start, -1);
  const end = source.indexOf(
    "  useCustomIndicatorWorkbenchShortcuts({",
    start,
  );
  assert.notEqual(end, -1);
  return source.slice(start, end);
};

const sliceCreateNewScriptDraftHandler = (source: string): string => {
  const start = source.indexOf(
    "  const createNewScriptDraft = useCallback(async () => {",
  );
  assert.notEqual(start, -1);
  const end = source.indexOf("  const saveCurrentIndicator", start);
  assert.notEqual(end, -1);
  return source.slice(start, end);
};

test("custom indicator save commits the backend profile save result", () => {
  const saveHandler = sliceSaveCurrentIndicatorHandler(
    readCustomIndicatorPageSource(),
  );

  assert.match(
    saveHandler,
    /const result = await saveSavedIndicatorProfile\(\{/,
  );
  assert.match(saveHandler, /state\.setSavedProfiles\(result\.profiles\);/);
  assert.doesNotMatch(saveHandler, /setSavedProfiles\(\(current\) =>/);
  assert.doesNotMatch(saveHandler, /upsertSavedIndicatorProfile/);
});

test("custom indicator actions stay local and never route through an account", () => {
  const source = readCustomIndicatorPageSource();
  const stateSource = readCustomIndicatorStateSource();
  const layoutSource = readCustomIndicatorLayoutSource();
  const saveHandler = sliceSaveCurrentIndicatorHandler(source);
  const createHandler = sliceCreateNewScriptDraftHandler(source);
  const removedFallbackOptionPattern = new RegExp("fallback" + "ToCurrentFlow");
  const removedAccountPattern = new RegExp(
    ["ACCOUNT", "MEMBERSHIP", "requestAccountAccess", "AccountCenter"].join("|"),
  );

  assert.match(source, /const result = await saveSavedIndicatorProfile\(\{/);
  assert.doesNotMatch(source, /writeSavedIndicatorProfiles\(savedProfiles\)/);
  assert.match(saveHandler, /code: result\.code/);
  assert.match(createHandler, /startBlankDraft\(\);/);
  assert.doesNotMatch(source, removedAccountPattern);
  assert.doesNotMatch(stateSource, removedAccountPattern);
  assert.doesNotMatch(layoutSource, removedAccountPattern);
  assert.doesNotMatch(source, removedFallbackOptionPattern);
  assert.doesNotMatch(stateSource, removedFallbackOptionPattern);
  assert.doesNotMatch(layoutSource, /disabled=\{profile\.locked\}/);
  assert.doesNotMatch(stateSource, /isCreateNewScriptLocked/);
  assert.doesNotMatch(stateSource, /createNewScriptLockReason/);
  assert.doesNotMatch(layoutSource, /isCreateNewScriptLocked/);
  assert.doesNotMatch(layoutSource, /custom-indicator-manager-create-lock/);
});

test("custom indicator create new starts from a blank draft", () => {
  const createHandler = sliceCreateNewScriptDraftHandler(
    readCustomIndicatorPageSource(),
  );

  assert.match(
    createHandler,
    /const nextDefinitions: IndicatorParameterDefinition\[\] = \[\];/,
  );
  assert.match(
    createHandler,
    /const nextInputs: Record<string, string> = \{\};/,
  );
  assert.match(createHandler, /setScriptSource\(""\);/);
  assert.match(createHandler, /setParameterDefinitions\(nextDefinitions\);/);
  assert.match(createHandler, /setParameterInputs\(nextInputs\);/);
  assert.match(createHandler, /setProfileNameInput\(""\);/);
  assert.match(createHandler, /setProfileNameEditMode\(true\);/);
  assert.match(createHandler, /setCompiledScriptState\(null\);/);
  assert.match(createHandler, /setCompileIssues\(\[\]\);/);
  assert.match(createHandler, /setParameterWarnings\(\[\]\);/);
  assert.match(createHandler, /setRuntimeIssues\(\[\]\);/);
  assert.doesNotMatch(createHandler, /nextTemplate/);
  assert.doesNotMatch(createHandler, /compileAndApplyScript/);
  assert.doesNotMatch(createHandler, /runScriptRuntimeCheckWithDiagnostics/);
});

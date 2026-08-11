// SPDX-License-Identifier: GPL-3.0-only

import type { FutuDataScopeBlockReason } from "@/domains/custom-indicator/indicator/supportTypes";
import { loadLocaleCatalog } from "@zinuto/shared/i18n";
import { type AppUiLanguage } from "@/ui/config/uiConfig";

type TemplateValues = ReadonlyArray<string | number>;

export type CustomIndicatorEngineCopy = {
  format: {
    linePrefix: string;
    columnPrefix: string;
    bulletSeparator: string;
    snippetSeparator: string;
  };
  blockedReasonLabels: Record<FutuDataScopeBlockReason, string>;
  parser: {
    expectedStatementIdentifier: string;
    expectedAssignmentOperator: string;
    expectedPlotDirective: string;
    plotDirectiveCannotBeEmpty: string;
    expectedSemicolonAfterStatement: string;
    expectedStatementOrFunctionCall: string;
    expectedGroupedExpressionClose: string;
    expectedExpression: string;
    functionCallMustIncludeArguments: string;
    unsupportedBinaryOperatorToken: string;
    unsupportedUnaryOperatorToken: string;
    expectedOpenParenAfterFunctionName: string;
    expectedCloseParenAfterFunctionArguments: string;
    invalidNumberLiteral: string;
    unterminatedCommentBlock: string;
    unterminatedStringLiteral: string;
    unexpectedCharacter: string;
  };
  compiler: {
    indicatorNameCannotBeEmpty: string;
    indicatorSourceCannotBeEmpty: string;
    indicatorSourceTooLong: string;
    parameterCountExceeded: string;
    parameterNameCannotBeEmpty: string;
    duplicatedParameter: string;
    invalidDefaultValueForParameter: string;
    tokenCountExceeded: string;
    statementCountExceeded: string;
    unsupportedFunctionInCurrentDataScope: string;
    unsupportedRenderFunction: string;
    unsupportedFunction: string;
    unsupportedPlotDirective: string;
    outputKeyCannotBeEmpty: string;
    outputRequired: string;
    outputCountExceeded: string;
    duplicatedOutputInScript: string;
    duplicatedOutputDefinition: string;
    outputDefinitionNotFound: string;
    outputDefinitionMetadataMissing: string;
    parserUnknownError: string;
  };
  runtime: {
    executionOperationLimitExceeded: string;
    unsupportedBinaryOperator: string;
    unsupportedUnaryOperator: string;
    unsupportedAstExpression: string;
    statementExecutionFailed: string;
    executionStatementLimitExceeded: string;
    runtimeBarCountExceeded: string;
    invalidParameterOverride: string;
    outputSeriesMissing: string;
    indicatorProfileStorageExceeded: string;
    executionFailed: string;
  };
  worker: {
    workerExecutionFailed: string;
    workerCrashed: string;
    workerTimeout: string;
    workerDisposed: string;
  };
};

const readUiConfigCatalogValue = (
  language: AppUiLanguage,
  key: string,
): string => {
  const catalog = loadLocaleCatalog(language, "uiConfig" as never) as Record<
    string,
    string
  >;
  const value = catalog[key];
  if (typeof value !== "string") {
    throw new Error(`Missing uiConfig bundle "${key}" for ${language}`);
  }
  return value;
};

const parseCustomIndicatorEngineBundle = (
  language: AppUiLanguage,
): CustomIndicatorEngineCopy => {
  const raw = readUiConfigCatalogValue(language, "customIndicatorEngine.bundle");
  return JSON.parse(raw) as CustomIndicatorEngineCopy;
};

const replaceTemplatePlaceholders = (
  template: string,
  values: TemplateValues,
): string =>
  values.reduce<string>(
    (current, value, index) =>
      current.replaceAll(`{${String(index)}}`, String(value ?? "")),
    template,
  );

export const getCustomIndicatorEngineCopy = (
  language: AppUiLanguage,
): CustomIndicatorEngineCopy => parseCustomIndicatorEngineBundle(language);

export const formatCustomIndicatorEngineTemplate = (
  template: string,
  values: TemplateValues = [],
): string =>
  replaceTemplatePlaceholders(
    template,
    values,
  );

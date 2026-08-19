// SPDX-License-Identifier: GPL-3.0-only

import path from 'node:path';

import { canonicalizeTimeZone } from '@zinuto/shared/timezone';

import { previewLocalDataImportFolderCore } from '../dataSource/folderPreview.js';
import type { MarketDataAcquisitionSourceMetadataV3 } from '../dataSource/marketDataAcquisitionSourceMetadata.js';
import { parseSymbolFromFileName } from '../dataSource/sourceIdentity.js';
import {
  AcquisitionRuntimeError,
  type AcquisitionRequest,
  type MarketAcquisitionJob,
  type MarketAcquisitionRequest,
} from './marketDataAcquisitionTypes.js';
import {
  resolveAcquisitionImportSymbol,
  resolveMarketAcquisitionImportSymbol,
} from './acquisitionStaging.js';

const CANONICAL_HEADERS = ['datetime', 'open', 'high', 'low', 'close', 'volume'];

const areEquivalentTimeZones = (left: string, right: string): boolean => {
  const canonicalLeft = canonicalizeTimeZone(left);
  const canonicalRight = canonicalizeTimeZone(right);
  return canonicalLeft !== null && canonicalLeft === canonicalRight;
};

type ValidationCheck =
  | 'files'
  | 'symbols'
  | 'timeframe'
  | 'timezone'
  | 'headers'
  | 'metadata'
  | 'sourceResults';

const validationFailure = (
  check: ValidationCheck,
  details: Record<string, string | number | boolean | null>,
): never => {
  throw new AcquisitionRuntimeError('ACQUISITION_IMPORT_VALIDATION_FAILED', {
    validationCheck: check,
    ...details,
  });
};

export const validateAcquisitionStagingWithImportPreview = async ({
  payloadRoot,
  outputFolderName,
  request,
  jobId,
}: {
  payloadRoot: string;
  outputFolderName: string;
  request: AcquisitionRequest;
  jobId: string;
}): Promise<void> => {
  const normalizedPayloadRoot = path.resolve(payloadRoot);
  let previewId = 0;
  try {
    const preview = await previewLocalDataImportFolderCore(
      normalizedPayloadRoot,
      {
        normalizeImportFilePath: (value) => path.resolve(value),
        assertManagedImportTempPath: (value) => {
          if (path.resolve(value) !== normalizedPayloadRoot) {
            throw new AcquisitionRuntimeError('ACQUISITION_IMPORT_VALIDATION_FAILED');
          }
        },
        parseSymbolFromFileName,
        createId: () => `${jobId}-preview-${previewId += 1}`,
      },
      {
        locale: 'en',
        sourceFolderName: outputFolderName,
      },
    );
    const expectedTimeZone = request.connectorId === 'akshare'
      ? 'Asia/Shanghai'
      : 'Etc/UTC';
    const expectedSymbols = [...new Set(
      request.symbols.map(resolveAcquisitionImportSymbol),
    )].sort();
    const expectedAdjustment = request.connectorId === 'akshare'
      ? request.adjustment
      : null;
    const acquisitionMetadata = preview.marketDataAcquisitionMetadata;
    const previewSymbols = [...new Set(
      preview.plans
        .filter((plan) => plan.strategy === 'FLAT')
        .flatMap((plan) => plan.files.map((file) => file.symbol)),
    )].sort();
    if (
      preview.totalFiles !== request.symbols.length ||
      preview.validFiles !== request.symbols.length ||
      preview.invalidFiles !== 0
    ) {
      validationFailure('files', {
        connectorId: request.connectorId,
        expectedFiles: request.symbols.length,
        totalFiles: preview.totalFiles,
        validFiles: preview.validFiles,
        invalidFiles: preview.invalidFiles,
      });
    }
    if (preview.validSymbolCount !== request.symbols.length) {
      validationFailure('symbols', {
        connectorId: request.connectorId,
        expectedSymbols: request.symbols.length,
        validSymbolCount: preview.validSymbolCount,
      });
    }
    if (
      preview.detectedTimeframe !== request.timeframe ||
      preview.detectedTimeframes.length !== 1 ||
      preview.detectedTimeframes[0] !== request.timeframe
    ) {
      validationFailure('timeframe', {
        connectorId: request.connectorId,
        expectedTimeframe: request.timeframe,
        detectedTimeframe: preview.detectedTimeframes[0] ?? preview.detectedTimeframe ?? null,
      });
    }
    if (!areEquivalentTimeZones(preview.suggestedTimeZone, expectedTimeZone)) {
      validationFailure('timezone', {
        connectorId: request.connectorId,
        expectedTimeZone,
        suggestedTimeZone: preview.suggestedTimeZone,
      });
    }
    if (JSON.stringify(previewSymbols) !== JSON.stringify(expectedSymbols)) {
      validationFailure('symbols', {
        connectorId: request.connectorId,
        expectedSymbols: expectedSymbols.join(','),
        previewSymbols: previewSymbols.join(','),
      });
    }
    if (
      !acquisitionMetadata ||
      acquisitionMetadata.schemaVersion !== 2 ||
      acquisitionMetadata.connectorId !== request.connectorId ||
      acquisitionMetadata.adjustment !== expectedAdjustment ||
      acquisitionMetadata.timeframe !== request.timeframe ||
      JSON.stringify(acquisitionMetadata.sourceSymbols) !== JSON.stringify(request.symbols) ||
      JSON.stringify(acquisitionMetadata.importSymbols) !== JSON.stringify(
        request.symbols.map(resolveAcquisitionImportSymbol),
      )
    ) {
      validationFailure('metadata', {
        connectorId: request.connectorId,
        schemaVersion: acquisitionMetadata?.schemaVersion ?? null,
        metadataConnectorId: acquisitionMetadata?.connectorId ?? null,
      });
    }
    if (
      CANONICAL_HEADERS.some((header, index) => preview.headers[index] !== header) ||
      preview.headers.length !== CANONICAL_HEADERS.length
    ) {
      validationFailure('headers', {
        connectorId: request.connectorId,
        expectedHeaders: CANONICAL_HEADERS.join(','),
        headers: preview.headers.join(','),
      });
    }
  } catch (error) {
    if (
      error instanceof AcquisitionRuntimeError &&
      error.code === 'ACQUISITION_IMPORT_VALIDATION_FAILED'
    ) {
      throw error;
    }
    validationFailure('metadata', {
      validationErrorType: error instanceof Error ? error.name : typeof error,
    });
  }
};

export const validateMarketAcquisitionStagingWithImportPreview = async ({
  payloadRoot,
  outputFolderName,
  request,
  timeZone,
  sourceResults,
  jobId,
}: {
  payloadRoot: string;
  outputFolderName: string;
  request: MarketAcquisitionRequest;
  timeZone: string;
  sourceResults: MarketAcquisitionJob['sourceResults'];
  jobId: string;
}): Promise<void> => {
  const normalizedPayloadRoot = path.resolve(payloadRoot);
  let previewId = 0;
  try {
    const preview = await previewLocalDataImportFolderCore(
      normalizedPayloadRoot,
      {
        normalizeImportFilePath: (value) => path.resolve(value),
        assertManagedImportTempPath: (value) => {
          if (path.resolve(value) !== normalizedPayloadRoot) {
            throw new AcquisitionRuntimeError('ACQUISITION_IMPORT_VALIDATION_FAILED');
          }
        },
        parseSymbolFromFileName,
        createId: () => `${jobId}-preview-${previewId += 1}`,
      },
      { locale: 'en', sourceFolderName: outputFolderName },
    );
    const expectedSymbols = [...new Set(
      sourceResults.map((result) =>
        resolveMarketAcquisitionImportSymbol(result.sourceSymbol)),
    )].sort();
    const previewSymbols = [...new Set(
      preview.plans
        .filter((plan) => plan.strategy === 'FLAT')
        .flatMap((plan) => plan.files.map((file) => file.symbol)),
    )].sort();
    const expectedPreviewTimeZone = timeZone === 'UTC' ? 'Etc/UTC' : timeZone;
    const acquisitionMetadata = preview.marketDataAcquisitionMetadata;
    const failedResult = sourceResults.find(
      (result, index) =>
        result.symbol !== request.symbols[index] ||
        !result.finalSource ||
        result.finalSource.status !== 'SUCCEEDED',
    );
    if (
      sourceResults.length !== request.symbols.length ||
      failedResult !== undefined
    ) {
      validationFailure('sourceResults', {
        marketId: request.marketId,
        symbol: failedResult?.symbol ?? null,
        expectedSymbols: request.symbols.length,
        sourceResults: sourceResults.length,
      });
    }
    if (
      preview.totalFiles !== request.symbols.length ||
      preview.validFiles !== request.symbols.length ||
      preview.invalidFiles !== 0
    ) {
      validationFailure('files', {
        marketId: request.marketId,
        expectedFiles: request.symbols.length,
        totalFiles: preview.totalFiles,
        validFiles: preview.validFiles,
        invalidFiles: preview.invalidFiles,
      });
    }
    if (preview.validSymbolCount !== request.symbols.length) {
      validationFailure('symbols', {
        marketId: request.marketId,
        expectedSymbols: request.symbols.length,
        validSymbolCount: preview.validSymbolCount,
      });
    }
    if (
      preview.detectedTimeframe !== request.timeframe ||
      preview.detectedTimeframes.length !== 1 ||
      preview.detectedTimeframes[0] !== request.timeframe
    ) {
      validationFailure('timeframe', {
        marketId: request.marketId,
        expectedTimeframe: request.timeframe,
        detectedTimeframe: preview.detectedTimeframes[0] ?? preview.detectedTimeframe ?? null,
      });
    }
    if (!areEquivalentTimeZones(preview.suggestedTimeZone, expectedPreviewTimeZone)) {
      validationFailure('timezone', {
        marketId: request.marketId,
        expectedTimeZone: expectedPreviewTimeZone,
        suggestedTimeZone: preview.suggestedTimeZone,
      });
    }
    if (JSON.stringify(previewSymbols) !== JSON.stringify(expectedSymbols)) {
      validationFailure('symbols', {
        marketId: request.marketId,
        expectedSymbols: expectedSymbols.join(','),
        previewSymbols: previewSymbols.join(','),
      });
    }
    const readMetadataField = (
      metadata: typeof acquisitionMetadata,
      field: 'marketId' | 'timeZone',
    ): string | null => {
      if (!metadata || metadata.schemaVersion !== 3) return null;
      const v3 = metadata as MarketDataAcquisitionSourceMetadataV3;
      return String(v3[field] ?? '');
    };
    if (
      !acquisitionMetadata ||
      acquisitionMetadata.schemaVersion !== 3 ||
      acquisitionMetadata.marketId !== request.marketId ||
      acquisitionMetadata.timeZone !== timeZone ||
      acquisitionMetadata.adjustment !== request.adjustment ||
      acquisitionMetadata.timeframe !== request.timeframe ||
      JSON.stringify(acquisitionMetadata.sourceSymbols) !== JSON.stringify(
        sourceResults.map((result) => result.sourceSymbol),
      ) ||
      JSON.stringify(acquisitionMetadata.importSymbols) !== JSON.stringify(
        sourceResults.map((result) =>
          resolveMarketAcquisitionImportSymbol(result.sourceSymbol)),
      ) ||
      acquisitionMetadata.sources.length !== sourceResults.length
    ) {
      validationFailure('metadata', {
        marketId: request.marketId,
        schemaVersion: acquisitionMetadata?.schemaVersion ?? null,
        metadataMarketId: readMetadataField(acquisitionMetadata, 'marketId'),
        metadataTimeZone: readMetadataField(acquisitionMetadata, 'timeZone'),
      });
    }
    if (
      CANONICAL_HEADERS.some((header, index) => preview.headers[index] !== header) ||
      preview.headers.length !== CANONICAL_HEADERS.length
    ) {
      validationFailure('headers', {
        marketId: request.marketId,
        expectedHeaders: CANONICAL_HEADERS.join(','),
        headers: preview.headers.join(','),
      });
    }
  } catch (error) {
    if (
      error instanceof AcquisitionRuntimeError &&
      error.code === 'ACQUISITION_IMPORT_VALIDATION_FAILED'
    ) {
      throw error;
    }
    validationFailure('metadata', {
      validationErrorType: error instanceof Error ? error.name : typeof error,
    });
  }
};

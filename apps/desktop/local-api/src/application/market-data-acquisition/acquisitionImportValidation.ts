// SPDX-License-Identifier: GPL-3.0-only

import path from 'node:path';

import { previewLocalDataImportFolderCore } from '../dataSource/folderPreview.js';
import { parseSymbolFromFileName } from '../dataSource/sourceIdentity.js';
import {
  AcquisitionRuntimeError,
  type AcquisitionRequest,
} from './marketDataAcquisitionTypes.js';
import { resolveAcquisitionImportSymbol } from './acquisitionStaging.js';

const CANONICAL_HEADERS = ['datetime', 'open', 'high', 'low', 'close', 'volume'];

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
      preview.invalidFiles !== 0 ||
      preview.validSymbolCount !== request.symbols.length ||
      preview.detectedTimeframe !== request.timeframe ||
      preview.detectedTimeframes.length !== 1 ||
      preview.detectedTimeframes[0] !== request.timeframe ||
      preview.suggestedTimeZone !== expectedTimeZone ||
      JSON.stringify(previewSymbols) !== JSON.stringify(expectedSymbols) ||
      !acquisitionMetadata ||
      acquisitionMetadata.schemaVersion !== 2 ||
      acquisitionMetadata.connectorId !== request.connectorId ||
      acquisitionMetadata.adjustment !== expectedAdjustment ||
      acquisitionMetadata.timeframe !== request.timeframe ||
      JSON.stringify(acquisitionMetadata.sourceSymbols) !== JSON.stringify(request.symbols) ||
      JSON.stringify(acquisitionMetadata.importSymbols) !== JSON.stringify(
        request.symbols.map(resolveAcquisitionImportSymbol),
      ) ||
      CANONICAL_HEADERS.some((header, index) => preview.headers[index] !== header) ||
      preview.headers.length !== CANONICAL_HEADERS.length
    ) {
      throw new AcquisitionRuntimeError('ACQUISITION_IMPORT_VALIDATION_FAILED', {
        connectorId: request.connectorId,
        expectedTimeframe: request.timeframe,
      });
    }
  } catch (error) {
    if (
      error instanceof AcquisitionRuntimeError &&
      error.code === 'ACQUISITION_IMPORT_VALIDATION_FAILED'
    ) {
      throw error;
    }
    throw new AcquisitionRuntimeError('ACQUISITION_IMPORT_VALIDATION_FAILED', {
      validationErrorType: error instanceof Error ? error.name : typeof error,
    });
  }
};

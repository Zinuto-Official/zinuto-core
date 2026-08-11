// SPDX-License-Identifier: GPL-3.0-only

import { api } from '@/api';
import type {
  CompiledIndicator,
  IndicatorExecutionResult,
  IndicatorRuntimeExecuteInput,
} from '@/domains/custom-indicator/indicator/types';
import type { AppUiLanguage } from '@/ui/config/uiConfig';

type CustomIndicatorBackendExecutionClientErrorCode =
  | 'BACKEND_EXECUTION_FAILED'
  | 'BACKEND_DISPOSED';

export class CustomIndicatorBackendExecutionClientError extends Error {
  readonly code: CustomIndicatorBackendExecutionClientErrorCode;

  constructor(code: CustomIndicatorBackendExecutionClientErrorCode, message: string) {
    super(message);
    this.name = 'CustomIndicatorBackendExecutionClientError';
    this.code = code;
  }
}

class CustomIndicatorBackendExecutionClient {
  async execute(
    compiled: CompiledIndicator,
    input: IndicatorRuntimeExecuteInput,
    language?: AppUiLanguage,
  ): Promise<IndicatorExecutionResult> {
    return api.executeCustomIndicatorScript({
      compiled,
      input,
      language,
    });
  }

  dispose() {
    // No local worker or evaluator state remains after the thin-page migration.
  }
}

export const customIndicatorBackendExecutionClient =
  new CustomIndicatorBackendExecutionClient();

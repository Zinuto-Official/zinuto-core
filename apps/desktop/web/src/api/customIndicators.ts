// SPDX-License-Identifier: GPL-3.0-only

import type { ApiRequestOptions, ApiRequester } from "@/api/requesterTypes";
import type {
  CompiledIndicator,
  IndicatorCompileError,
  IndicatorExecutionResult,
  IndicatorParameterDefinition,
  IndicatorRuntimeExecuteInput,
} from "@/domains/custom-indicator/indicator/types";
import type { AppUiLanguage } from "@/ui/config/uiConfig";

export type ApiSavedIndicatorProfile = {
  id: string;
  name: string;
  source: string;
  parameterInputs: Record<string, string>;
  revisions?: ApiSavedIndicatorProfileRevision[];
  createdAt: string;
  updatedAt: string;
};

export type ApiSavedIndicatorProfileRevision = {
  source: string;
  parameterInputs: Record<string, string>;
  savedAt: string;
};

type ApiReplaceCustomIndicatorProfilesResult = {
  storedCount: number;
  profiles: ApiSavedIndicatorProfile[];
  updatedAt: string;
};

export type ApiSaveCustomIndicatorProfileRequest = {
  id?: string;
  name: string;
  source: string;
  parameterInputs: Record<string, string>;
};

export type ApiSaveCustomIndicatorProfileResult = {
  storedCount: number;
  profiles: ApiSavedIndicatorProfile[];
  profile: ApiSavedIndicatorProfile;
  updatedAt: string;
};

export type ApiDeleteCustomIndicatorProfileResult = {
  storedCount: number;
  profiles: ApiSavedIndicatorProfile[];
  deletedProfileId: string;
  updatedAt: string;
};

export type ApiCompileCustomIndicatorScriptRequest = {
  source: string;
  parameters?: IndicatorParameterDefinition[];
  parameterInputs?: Record<string, string>;
  invalidParamLabel?: string;
  displayName?: string;
  language?: AppUiLanguage;
};

export type ApiCompiledScriptState = {
  templateName: string;
  displayName: string;
  compiled: CompiledIndicator;
  calcParams: number[];
};

export type ApiCompileCustomIndicatorScriptResult = {
  state: ApiCompiledScriptState | null;
  compileErrors: IndicatorCompileError[];
  compileMessages: string[];
  parameterWarnings: string[];
  nextParameterDefinitions: IndicatorParameterDefinition[];
  nextParameterInputs: Record<string, string>;
};

export type ApiExecuteCustomIndicatorScriptRequest = {
  compiled: CompiledIndicator;
  input: IndicatorRuntimeExecuteInput;
  language?: AppUiLanguage;
};

export const createCustomIndicatorsApi = (request: ApiRequester) => ({
  listCustomIndicatorProfiles: (options?: ApiRequestOptions) =>
    request<ApiSavedIndicatorProfile[]>(
      "/api/v1/custom-indicators/profiles",
      options,
    ),
  replaceCustomIndicatorProfiles: (
    profiles: ApiSavedIndicatorProfile[],
    options?: ApiRequestOptions,
  ) =>
    request<ApiReplaceCustomIndicatorProfilesResult>(
      "/api/v1/custom-indicators/profiles",
      {
        method: "PUT",
        body: JSON.stringify({ profiles }),
        ...options,
      },
    ),
  saveCustomIndicatorProfile: (
    payload: ApiSaveCustomIndicatorProfileRequest,
    options?: ApiRequestOptions,
  ) =>
    request<ApiSaveCustomIndicatorProfileResult>(
      "/api/v1/custom-indicators/profiles/save",
      {
        method: "POST",
        body: JSON.stringify(payload),
        ...options,
      },
    ),
  deleteCustomIndicatorProfile: (
    profileId: string,
    options?: ApiRequestOptions,
  ) =>
    request<ApiDeleteCustomIndicatorProfileResult>(
      "/api/v1/custom-indicators/profiles/delete",
      {
        method: "POST",
        body: JSON.stringify({ profileId }),
        ...options,
      },
    ),
  compileCustomIndicatorScript: (
    payload: ApiCompileCustomIndicatorScriptRequest,
    options?: ApiRequestOptions,
  ) =>
    request<ApiCompileCustomIndicatorScriptResult>(
      "/api/v1/custom-indicators/compile",
      {
        method: "POST",
        body: JSON.stringify(payload),
        ...options,
      },
    ),
  executeCustomIndicatorScript: (
    payload: ApiExecuteCustomIndicatorScriptRequest,
    options?: ApiRequestOptions,
  ) =>
    request<IndicatorExecutionResult>(
      "/api/v1/custom-indicators/execute",
      {
        method: "POST",
        body: JSON.stringify(payload),
        ...options,
      },
    ),
});

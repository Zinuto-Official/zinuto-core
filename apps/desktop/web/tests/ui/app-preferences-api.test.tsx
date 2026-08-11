// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import { createSystemApi } from "../../src/api/system";
import type {
  ApiRequester,
  ApiRequesterOptions,
} from "../../src/api/requesterTypes";

test("app preferences API wraps ui settings for the v1 contract", async () => {
  let requestedPath = "";
  let requestedMethod = "";
  let requestedBody = "";
  const request: ApiRequester = async <T,>(
    path: string,
    init?: ApiRequesterOptions,
  ): Promise<T> => {
    requestedPath = path;
    requestedMethod = init?.method ?? "";
    requestedBody = String(init?.body ?? "");
    return {
      uiSettings: {
        onboardingTourStatus: "SKIPPED",
      },
    } as T;
  };
  const systemApi = createSystemApi(request);

  const response = await systemApi.updateAppUiSettings({
    onboardingTourStatus: "SKIPPED",
  });

  assert.equal(requestedPath, "/api/v1/system/app-preferences/ui-settings");
  assert.equal(requestedMethod, "PUT");
  assert.deepEqual(JSON.parse(requestedBody), {
    uiSettings: {
      onboardingTourStatus: "SKIPPED",
    },
  });
  assert.equal(response.onboardingTourStatus, "SKIPPED");
});

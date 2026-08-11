// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import {
  formatSpecialTrainingBankTimeframeLabel,
  formatSpecialTrainingBankTimeframeCode,
  resolveSpecialTrainingBankApiErrorMessage,
} from "../../src/workspaces/special-training/specialTrainingBankUi";

test("bank timeframe formatter always returns canonical codes", () => {
  assert.equal(formatSpecialTrainingBankTimeframeCode("1m"), "1m");
  assert.equal(formatSpecialTrainingBankTimeframeCode("1d"), "1d");
  assert.equal(formatSpecialTrainingBankTimeframeCode(null), "");
});

test("bank timeframe label formatter returns localized text", () => {
  assert.equal(formatSpecialTrainingBankTimeframeLabel("zh-CN", "1m"), "1分钟");
  assert.equal(formatSpecialTrainingBankTimeframeLabel("zh-CN", "5m"), "5分钟");
  assert.equal(formatSpecialTrainingBankTimeframeLabel("zh-CN", "1h"), "1小时");
  assert.equal(formatSpecialTrainingBankTimeframeLabel("zh-CN", "1d"), "日K");
  assert.equal(formatSpecialTrainingBankTimeframeLabel("en", "1d"), "Daily");
});

test("bank api error message shows localized timeframe labels in zh-CN", () => {
  const message = resolveSpecialTrainingBankApiErrorMessage({
    language: "zh-CN",
    error: {
      code: "SPECIAL_TRAINING_BANK_TARGET_TIMEFRAME_INVALID",
      args: {
        targetTimeframe: "1h",
        maxSourceTimeframe: "1d",
      },
      message: "参数不正确",
    },
    fallbackMessage: "参数不正确",
  });

  assert.match(message, /1小时/);
  assert.match(message, /日K/);
  assert.doesNotMatch(message, /displayPeriod\./);
  assert.doesNotMatch(message, /1h/);
});

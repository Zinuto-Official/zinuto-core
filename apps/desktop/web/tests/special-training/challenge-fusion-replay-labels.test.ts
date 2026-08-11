// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import { resolveHistoryReplayProject } from "../../src/workspaces/challenge-stats/challengeFusionDashboardModel";

test("challenge stats replay rebuilds extreme tags from localized floating labels", () => {
  const detail = {
    replay: {
      bars: [],
      specialTraining: {
        fastDecisionExtremeRay: {
          profitPrice: 205.12,
          drawdownPrice: 146.98,
          baselinePrice: 168,
          profitRatio: 0.1585,
          drawdownRatio: 0.0894,
          profitTagText: "MFE +15.85%",
          drawdownTagText: "MAE -8.94%",
        },
      },
    },
  };

  const project = resolveHistoryReplayProject(
    {
      id: "question-1",
      symbol: "TEST",
    } as any,
    detail as any,
    {
      mfeLabel: "最大浮盈",
      maeLabel: "最大浮亏",
    },
  );

  const extremeRay = (project?.replay as any).specialTraining.fastDecisionExtremeRay;

  assert.equal(extremeRay.profitTagText, "最大浮盈 +15.85%");
  assert.equal(extremeRay.drawdownTagText, "最大浮亏 -8.94%");
  assert.equal(detail.replay.specialTraining.fastDecisionExtremeRay.profitTagText, "MFE +15.85%");
  assert.equal(detail.replay.specialTraining.fastDecisionExtremeRay.drawdownTagText, "MAE -8.94%");
});

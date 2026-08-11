// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import { resolveImportPreviewPoolGroups } from "../../src/domains/data-import/importPreviewPools";

test("import preview pool groups use backend default names and order", () => {
  const groups = resolveImportPreviewPoolGroups(
    {
      folderName: "本地行情",
      confirmableImportPlans: [
        {
          id: "plan-1",
          previewPlanId: "plan-1",
          strategy: "FLAT",
          baseTimeframe: "1m",
          topLevelSubfolder: "",
          defaultPoolName: "本地行情-1分钟",
          symbolCount: 2,
          fileCount: 2,
        },
        {
          id: "plan-2",
          previewPlanId: "plan-2",
          strategy: "FLAT",
          baseTimeframe: "5m",
          topLevelSubfolder: "",
          defaultPoolName: "本地行情-5分钟",
          symbolCount: 3,
          fileCount: 3,
        },
        {
          id: "plan-3",
          previewPlanId: "plan-3",
          strategy: "FLAT",
          baseTimeframe: "1h",
          topLevelSubfolder: "",
          defaultPoolName: "本地行情-1小时",
          symbolCount: 4,
          fileCount: 4,
        },
        {
          id: "plan-4",
          previewPlanId: "plan-4",
          strategy: "FLAT",
          baseTimeframe: "1d",
          topLevelSubfolder: "",
          defaultPoolName: "本地行情-日K",
          symbolCount: 5,
          fileCount: 5,
        },
      ],
    },
    "FLAT",
    "",
  );

  assert.deepEqual(
    groups.map((group) => group.name),
    ["本地行情-1分钟", "本地行情-5分钟", "本地行情-1小时", "本地行情-日K"],
  );
});

test("import preview parent strategy keeps backend default names", () => {
  const groups = resolveImportPreviewPoolGroups(
    {
      folderName: "本地行情",
      confirmableImportPlans: [
        {
          id: "plan-1",
          previewPlanId: "plan-1",
          strategy: "WITH_PARENT",
          baseTimeframe: "1d",
          topLevelSubfolder: "美股",
          defaultPoolName: "本地行情-美股-日K",
          symbolCount: 2,
          fileCount: 2,
        },
      ],
    },
    "WITH_PARENT",
    "",
  );

  assert.equal(groups[0]?.name, "本地行情-美股-日K");
});

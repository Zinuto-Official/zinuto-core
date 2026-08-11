#!/usr/bin/env node

// SPDX-License-Identifier: GPL-3.0-only


import fs from "node:fs";

import {
  PRODUCT_LANE_IDS,
  PRODUCT_LANE_IDS_WITH_GOVERNANCE,
  computeChangeImpact,
  formatChangeImpactReport,
} from "./repo-governance.mjs";
import { execFileSync } from "node:child_process";

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
const CHECKBOX_PATTERN = new RegExp(
  `^\\s*-\\s*\\[(?<checked>[ xX])\\]\\s*\`?(?<laneId>${PRODUCT_LANE_IDS_WITH_GOVERNANCE.map(escapeRegExp).join("|")})\\b\`?`,
  "gm",
);

const parseArgs = (argv) => {
  const options = {
    base: "",
    bodyFile: "",
    eventPath: process.env.GITHUB_EVENT_PATH || "",
    files: [],
    head: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === "--base") {
      options.base = String(argv[index + 1] || "").trim();
      index += 1;
      continue;
    }
    if (current === "--head") {
      options.head = String(argv[index + 1] || "").trim();
      index += 1;
      continue;
    }
    if (current === "--event-path") {
      options.eventPath = String(argv[index + 1] || "").trim();
      index += 1;
      continue;
    }
    if (current === "--body-file") {
      options.bodyFile = String(argv[index + 1] || "").trim();
      index += 1;
      continue;
    }
    if (current === "--files") {
      options.files.push(...argv.slice(index + 1));
      break;
    }
    if (current === "--help" || current === "-h") {
      process.stdout.write(
        [
          "Usage:",
          "  node tools/quality/validate-pr-impact.mjs --base <sha> --head <sha>",
          "  node tools/quality/validate-pr-impact.mjs --body-file <path> --files <paths...>",
          "",
          "Options:",
          "  --base <sha>        Git diff base sha.",
          "  --head <sha>        Git diff head sha.",
          "  --event-path <path> GitHub event payload path.",
          "  --body-file <path>  Plain text body file for local validation.",
          "  --files <paths...>  Explicit repo-relative file list.",
        ].join("\n"),
      );
      process.exit(0);
    }
    throw new Error(`Unknown option: ${current}`);
  }

  return options;
};

const readBody = (options) => {
  if (options.bodyFile) {
    return fs.readFileSync(options.bodyFile, "utf8");
  }
  if (!options.eventPath) {
    throw new Error("Missing PR body source. Pass --body-file or set GITHUB_EVENT_PATH.");
  }
  const eventPayload = JSON.parse(fs.readFileSync(options.eventPath, "utf8"));
  const body = String(eventPayload?.pull_request?.body || "").trim();
  if (!body) {
    throw new Error("Pull request body is empty. Fill in the impacted product lines checklist.");
  }
  return body;
};

const listChangedFilesFromGit = (base, head) => {
  const resolvedHead = head || "HEAD";
  const args = ["diff", "--name-only", "--diff-filter=ACMR"];
  if (base) {
    args.push(base, resolvedHead);
  } else {
    args.push("HEAD~1", resolvedHead);
  }
  const output = execFileSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  return output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
};

const parseCheckedLaneIds = (body) => {
  const checkedLaneIds = new Set();
  CHECKBOX_PATTERN.lastIndex = 0;
  let match = CHECKBOX_PATTERN.exec(body);
  while (match) {
    if (String(match.groups?.checked || "").toLowerCase() === "x") {
      checkedLaneIds.add(String(match.groups?.laneId || "").trim());
    }
    match = CHECKBOX_PATTERN.exec(body);
  }
  return checkedLaneIds;
};

const main = () => {
  const options = parseArgs(process.argv.slice(2));
  const body = readBody(options);
  const changedFiles =
    options.files.length > 0
      ? options.files
      : listChangedFilesFromGit(options.base, options.head);
  const impact = computeChangeImpact(changedFiles);
  const checkedLaneIds = parseCheckedLaneIds(body);

  const invalidCheckedLaneIds = [...checkedLaneIds].filter(
    (laneId) => !PRODUCT_LANE_IDS_WITH_GOVERNANCE.includes(laneId),
  );
  if (invalidCheckedLaneIds.length > 0) {
    throw new Error(`Unknown impacted product line values: ${invalidCheckedLaneIds.join(", ")}`);
  }

  const requiredLaneIds =
    impact.impactedLaneIds.length > 0
      ? [...impact.impactedLaneIds]
      : impact.governanceOnly || impact.docsOnly
        ? ["governance-docs"]
        : [];

  if (requiredLaneIds.length === 0 && impact.changedFiles.length > 0 && impact.unmappedFiles.length > 0) {
    throw new Error(
      [
        "Changed files could not be mapped to a product lane.",
        formatChangeImpactReport(impact),
      ].join("\n\n"),
    );
  }

  const missingLaneIds = requiredLaneIds.filter((laneId) => !checkedLaneIds.has(laneId));
  if (missingLaneIds.length > 0) {
    throw new Error(
      [
        `PR body is missing impacted product lines: ${missingLaneIds.join(", ")}`,
        "",
        formatChangeImpactReport(impact),
      ].join("\n"),
    );
  }

  const extraProductLaneIds = [...checkedLaneIds].filter(
    (laneId) => PRODUCT_LANE_IDS.includes(laneId) && !impact.impactedLaneIds.includes(laneId),
  );
  if (extraProductLaneIds.length > 0) {
    process.stdout.write(
      `Warning: checked extra product lines not inferred from paths: ${extraProductLaneIds.join(", ")}\n`,
    );
  }

  process.stdout.write(
    [
      "PR impact metadata is valid.",
      formatChangeImpactReport(impact),
    ].join("\n"),
  );
};

main();

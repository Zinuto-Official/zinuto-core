#!/usr/bin/env node

// SPDX-License-Identifier: GPL-3.0-only


import { execFileSync } from "node:child_process";
import fs from "node:fs";

import {
  PRODUCT_LANE_IDS,
  computeChangeImpact,
  formatChangeImpactReport,
} from "./repo-governance.mjs";

const parseArgs = (argv) => {
  const options = {
    base: "",
    files: [],
    githubOutput: "",
    head: "",
    json: false,
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
    if (current === "--files") {
      options.files.push(...argv.slice(index + 1));
      break;
    }
    if (current === "--github-output") {
      options.githubOutput = String(argv[index + 1] || "").trim();
      index += 1;
      continue;
    }
    if (current === "--json") {
      options.json = true;
      continue;
    }
    if (current === "--help" || current === "-h") {
      process.stdout.write(
        [
          "Usage:",
          "  node tools/quality/check-change-impact.mjs [--base <sha> --head <sha>]",
          "  node tools/quality/check-change-impact.mjs --files <path> [more paths]",
          "",
          "Options:",
          "  --base <sha>           Git diff base sha.",
          "  --head <sha>           Git diff head sha.",
          "  --files <paths...>     Explicit repo-relative file list.",
          "  --github-output <path> Write GitHub Actions outputs.",
          "  --json                 Print JSON instead of text.",
        ].join("\n"),
      );
      process.exit(0);
    }
    throw new Error(`Unknown option: ${current}`);
  }

  return options;
};

const listChangedFilesFromGit = (base, head) => {
  const resolvedHead = head || "HEAD";
  const args = ["diff", "--name-only", "--diff-filter=ACMR"];
  if (base) {
    args.push(base, resolvedHead);
  } else {
    // The initial commit has no HEAD~1; fall back to the empty tree so the
    // first commit is diffed as a full change set instead of crashing.
    let hasParent = true;
    try {
      execFileSync("git", ["rev-parse", "--verify", "-q", "HEAD~1"], {
        cwd: process.cwd(),
        stdio: "ignore",
      });
    } catch {
      hasParent = false;
    }
    if (hasParent) {
      args.push("HEAD~1", resolvedHead);
    } else {
      args.push("--root", resolvedHead);
    }
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

const writeGithubOutput = (outputPath, impact) => {
  const lines = [];
  lines.push(`impacted_lanes=${impact.impactedLaneIds.join(",")}`);
  lines.push(`governance_only=${impact.governanceOnly}`);
  lines.push(`docs_only=${impact.docsOnly}`);
  lines.push(`shared_export_keys=${impact.sharedImpact.exportKeys.join(",")}`);
  lines.push(`shared_consumer_lanes=${impact.sharedImpact.consumerLaneIds.join(",")}`);

  for (const laneId of PRODUCT_LANE_IDS) {
    const outputKey = laneId.replaceAll("-", "_");
    lines.push(`${outputKey}=${impact.impactedLaneIds.includes(laneId)}`);
  }
  lines.push(`governance_docs=${impact.governanceOnly || impact.docsOnly}`);

  fs.appendFileSync(outputPath, `${lines.join("\n")}\n`, "utf8");
};

const main = () => {
  const options = parseArgs(process.argv.slice(2));
  const changedFiles =
    options.files.length > 0
      ? options.files
      : listChangedFilesFromGit(options.base, options.head);
  const impact = computeChangeImpact(changedFiles);

  if (options.githubOutput) {
    writeGithubOutput(options.githubOutput, impact);
  }

  if (options.json) {
    process.stdout.write(`${JSON.stringify(impact, null, 2)}\n`);
    return;
  }

  process.stdout.write(formatChangeImpactReport(impact));
};

main();

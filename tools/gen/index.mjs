#!/usr/bin/env node

// SPDX-License-Identifier: GPL-3.0-only


import {
  formatScaffoldSummary,
  parseScaffoldArgs,
  resolveScaffoldPlan,
  writeScaffoldFiles,
} from "./scaffold-core.mjs";

const main = () => {
  try {
    const options = parseScaffoldArgs(process.argv.slice(2));
    const { files, metadata } = resolveScaffoldPlan(options);
    const written = writeScaffoldFiles(files, options);
    if (options.json) {
      console.log(
        JSON.stringify(
          {
            scaffold: options.scaffold,
            files: written,
            metadata,
            nextCommands: metadata.nextCommands,
            verifyFiles: metadata.verifyFiles,
          },
          null,
          2,
        ),
      );
      return;
    }
    console.log(formatScaffoldSummary(files, options));
  } catch (error) {
    console.error(`[gen] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
};

main();

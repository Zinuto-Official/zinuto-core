#!/usr/bin/env node

// SPDX-License-Identifier: GPL-3.0-only


import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workflowPath = path.join(rootDir, '.github/workflows/cla.yml');
const source = fs.readFileSync(workflowPath, 'utf8');
const failures = [];

const requiredFragments = [
  'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
  'ref: ${{ github.event.repository.default_branch }}',
  'persist-credentials: false',
  '--file contributors/cla-signatures.json',
];

for (const fragment of requiredFragments) {
  if (!source.includes(fragment)) failures.push(`missing trusted CLA workflow fragment: ${fragment}`);
}

if (/actions\/checkout@v\d/u.test(source)) {
  failures.push('checkout action must be pinned to a full commit SHA');
}
if (/ref:\s*\$\{\{\s*github\.event\.pull_request\.head/u.test(source)) {
  failures.push('fork code must never be checked out or executed by pull_request_target');
}
if (/pull_request\.head|HEAD_REPOSITORY|HEAD_SHA|gh api|RUNNER_TEMP/u.test(source)) {
  failures.push('CLA validation must not read a contributor-controlled registry from the PR head');
}

if (failures.length > 0) {
  process.stderr.write(`[cla-workflow] failed (${failures.length})\n`);
  failures.forEach((failure) => process.stderr.write(`- ${failure}\n`));
  process.exit(1);
}

process.stdout.write('[cla-workflow] trusted base script and trusted base signature registry validated\n');

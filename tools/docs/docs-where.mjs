#!/usr/bin/env node

// SPDX-License-Identifier: GPL-3.0-only


import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, "../..");

const readJson = (relativePath) =>
  JSON.parse(fs.readFileSync(path.join(ROOT_DIR, relativePath), "utf8"));

const parseArgs = (argv) => {
  const args = {
    query: "",
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--query") {
      args.query = String(argv[index + 1] ?? "");
      index += 1;
      continue;
    }
    if (arg.startsWith("--query=")) {
      args.query = arg.slice("--query=".length);
      continue;
    }
    if (arg === "--json") {
      args.json = true;
      continue;
    }
  }
  return args;
};

const normalize = (value) => String(value || "").trim().toLowerCase();

const scoreFeature = (feature, query) => {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) {
    return 0;
  }
  const haystack = [
    feature.id,
    feature.ownerLane,
    ...(feature.keywords ?? []),
    ...(feature.truthDocs ?? []),
    ...(feature.codeRoots ?? []),
    ...(feature.contracts ?? []),
  ]
    .map(normalize)
    .join(" ");
  let score = 0;
  for (const token of normalizedQuery.split(/[^a-z0-9@._/-]+/u).filter(Boolean)) {
    if (feature.id.toLowerCase() === token) {
      score += 8;
    }
    if ((feature.keywords ?? []).some((keyword) => normalize(keyword) === token)) {
      score += 5;
    }
    if (haystack.includes(token)) {
      score += 1;
    }
  }
  return score;
};

const main = () => {
  const args = parseArgs(process.argv.slice(2));
  if (!args.query) {
    process.stderr.write('Usage: npm run docs:where -- --query "<task>" [--json]\n');
    process.exit(2);
  }

  const lanes = readJson("docs/registry/product-lanes.json").lanes;
  const features = readJson("docs/registry/features.json").features;
  const contracts = readJson("docs/registry/contracts.json").contracts;
  const laneById = new Map(lanes.map((lane) => [lane.id, lane]));
  const contractById = new Map(contracts.map((contract) => [contract.id, contract]));

  const matches = features
    .map((feature) => ({ feature, score: scoreFeature(feature, args.query) }))
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score || left.feature.id.localeCompare(right.feature.id))
    .slice(0, 3)
    .map(({ feature, score }) => ({
      score,
      featureId: feature.id,
      ownerLane: feature.ownerLane,
      laneTitle: laneById.get(feature.ownerLane)?.title ?? feature.ownerLane,
      truthDocs: feature.truthDocs ?? [],
      codeRoots: feature.codeRoots ?? [],
      contracts: (feature.contracts ?? []).map((contractId) => ({
        id: contractId,
        source: contractById.get(contractId)?.source ?? null,
        publicBasePath: contractById.get(contractId)?.publicBasePath ?? null,
      })),
      tests: feature.tests ?? [],
      qualityCommands: feature.qualityCommands ?? [],
      debugPlaybooks: feature.debugPlaybooks ?? [],
    }));

  if (args.json) {
    process.stdout.write(`${JSON.stringify({ query: args.query, matches }, null, 2)}\n`);
    return;
  }

  if (matches.length === 0) {
    process.stdout.write(`No feature registry match for: ${args.query}\n`);
    process.stdout.write("Open docs/registry/features.json and docs/registry/product-lanes.json.\n");
    return;
  }

  for (const match of matches) {
    process.stdout.write(`Feature: ${match.featureId} (${match.laneTitle})\n`);
    process.stdout.write(`Truth docs: ${match.truthDocs.join(", ") || "(none)"}\n`);
    process.stdout.write(`Code roots: ${match.codeRoots.join(", ") || "(none)"}\n`);
    process.stdout.write(
      `Contracts: ${
        match.contracts
          .map((contract) => `${contract.id}${contract.publicBasePath ? ` ${contract.publicBasePath}` : ""}`)
          .join(", ") || "(none)"
      }\n`,
    );
    process.stdout.write(`Tests: ${match.tests.join(" | ") || "(none)"}\n`);
    process.stdout.write(`Quality: ${match.qualityCommands.join(" | ") || "(none)"}\n`);
    process.stdout.write(`Playbooks: ${match.debugPlaybooks.join(", ") || "(none)"}\n\n`);
  }
};

main();

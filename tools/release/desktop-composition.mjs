#!/usr/bin/env node

// SPDX-License-Identifier: GPL-3.0-only

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT_DIR = path.resolve(path.dirname(SCRIPT_PATH), '../..');

export const DESKTOP_COMPOSITION_PROTOCOL_VERSION = 1;
export const DESKTOP_DISTRIBUTION_IDS = Object.freeze(['community']);
export const ACTIVE_DESKTOP_COMPOSITION_PATH = path.join(
  ROOT_DIR,
  'config',
  'brand',
  'active.json',
);

const INPUT_KEYS = Object.freeze([
  'compositionProtocolVersion',
  'distributionId',
  'targetPlatform',
  'productName',
  'bundleIdentifier',
]);

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const requireSingleLineText = (value, label) => {
  const text = String(value ?? '').trim();
  if (!text || /[\r\n]/u.test(text)) {
    throw new Error(`[desktop-composition] ${label} must be non-empty single-line text`);
  }
  return text;
};

export const resolveDesktopCompositionHostTarget = (
  nodePlatform = process.platform,
) => {
  if (nodePlatform === 'darwin') return 'macos';
  if (nodePlatform === 'win32') return 'windows';
  return 'host';
};

export const validateDesktopCompositionInput = (input) => {
  if (!isPlainObject(input)) {
    throw new Error('[desktop-composition] composition input must be a JSON object');
  }
  const actualKeys = Object.keys(input).sort();
  const expectedKeys = [...INPUT_KEYS].sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
    throw new Error(
      `[desktop-composition] input keys must be exactly: ${INPUT_KEYS.join(', ')}`,
    );
  }
  if (input.compositionProtocolVersion !== DESKTOP_COMPOSITION_PROTOCOL_VERSION) {
    throw new Error(
      `[desktop-composition] compositionProtocolVersion must be ${DESKTOP_COMPOSITION_PROTOCOL_VERSION}`,
    );
  }
  if (input.distributionId !== 'community') {
    throw new Error('[desktop-composition] Core supports the community distribution only');
  }
  const targetPlatform = requireSingleLineText(input.targetPlatform, 'targetPlatform');
  if (!['host', 'macos', 'windows'].includes(targetPlatform)) {
    throw new Error('[desktop-composition] targetPlatform must be host, macos, or windows');
  }
  const productName = requireSingleLineText(input.productName, 'productName');
  const bundleIdentifier = requireSingleLineText(input.bundleIdentifier, 'bundleIdentifier');
  if (productName !== 'Zinuto Core') {
    throw new Error('[desktop-composition] productName must be Zinuto Core');
  }
  if (bundleIdentifier !== 'org.zinuto.core') {
    throw new Error('[desktop-composition] bundleIdentifier must be org.zinuto.core');
  }
  return {
    compositionProtocolVersion: DESKTOP_COMPOSITION_PROTOCOL_VERSION,
    distributionId: 'community',
    targetPlatform,
    productName,
    bundleIdentifier,
  };
};

export const resolveDesktopComposition = (
  input,
  { nodePlatform = process.platform } = {},
) => {
  const normalizedInput = validateDesktopCompositionInput(input);
  const hostTarget = resolveDesktopCompositionHostTarget(nodePlatform);
  const targetPlatform = normalizedInput.targetPlatform === 'host'
    ? hostTarget
    : normalizedInput.targetPlatform;
  if (
    normalizedInput.targetPlatform !== 'host'
    && hostTarget !== 'host'
    && targetPlatform !== hostTarget
  ) {
    throw new Error(
      `[desktop-composition] targetPlatform ${targetPlatform} does not match host ${hostTarget}`,
    );
  }
  return {
    protocolVersion: DESKTOP_COMPOSITION_PROTOCOL_VERSION,
    distributionId: 'community',
    targetPlatform,
    brand: {
      profile: 'community',
      productName: normalizedInput.productName,
      bundleIdentifier: normalizedInput.bundleIdentifier,
    },
    tauri: {
      features: [],
      additionalCapabilities: [],
    },
    input: normalizedInput,
  };
};

export const buildDesktopCompositionWebEnvironment = (plan, options = {}) => {
  const resolved = validateResolvedDesktopCompositionPlan(plan, options);
  return {
    VITE_DESKTOP_COMPOSITION_PROTOCOL_VERSION: String(resolved.protocolVersion),
    VITE_DESKTOP_DISTRIBUTION_ID: resolved.distributionId,
    VITE_DESKTOP_BRAND_PROFILE: resolved.brand.profile,
    VITE_DESKTOP_PRODUCT_NAME: resolved.brand.productName,
  };
};

const readRegularJsonFile = (filePath, label) => {
  const absolutePath = path.resolve(filePath);
  const metadata = fs.statSync(absolutePath);
  if (!metadata.isFile()) {
    throw new Error(`[desktop-composition] ${label} must be a regular file: ${absolutePath}`);
  }
  return JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
};

export const readDesktopComposition = (
  filePath,
  { nodePlatform = process.platform } = {},
) => resolveDesktopComposition(
  readRegularJsonFile(filePath, 'composition input'),
  { nodePlatform },
);

export const validateResolvedDesktopCompositionPlan = (
  plan,
  { nodePlatform = process.platform } = {},
) => {
  if (!isPlainObject(plan) || !isPlainObject(plan.input)) {
    throw new Error('[desktop-composition] resolved plan must contain its canonical input');
  }
  const expected = resolveDesktopComposition(plan.input, { nodePlatform });
  if (JSON.stringify(plan) !== JSON.stringify(expected)) {
    throw new Error('[desktop-composition] resolved plan does not match its canonical input');
  }
  return plan;
};

export const readResolvedDesktopCompositionPlan = (
  filePath,
  { nodePlatform = process.platform } = {},
) => validateResolvedDesktopCompositionPlan(
  readRegularJsonFile(filePath, 'resolved plan'),
  { nodePlatform },
);

export const readActiveDesktopComposition = (options = {}) =>
  readDesktopComposition(options.activePath ?? ACTIVE_DESKTOP_COMPOSITION_PATH, options);

const parseArguments = (args) => {
  const options = {
    active: false,
    format: 'json',
    inputPath: null,
    outputPath: null,
    resolvedPlanPath: null,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--active') options.active = true;
    else if (argument === '--input') options.inputPath = args[++index] ?? null;
    else if (argument === '--resolved-plan') options.resolvedPlanPath = args[++index] ?? null;
    else if (argument === '--output') options.outputPath = args[++index] ?? null;
    else if (argument === '--format') options.format = args[++index] ?? '';
    else if (argument === '--vite-env') options.format = 'vite-env';
    else throw new Error(`[desktop-composition] unknown option: ${argument}`);
  }
  const selectors = [options.active, options.inputPath, options.resolvedPlanPath].filter(Boolean);
  if (selectors.length !== 1) {
    throw new Error('[desktop-composition] select exactly one input');
  }
  if (!['json', 'vite-env'].includes(options.format)) {
    throw new Error('[desktop-composition] --format must be json or vite-env');
  }
  return options;
};

const main = () => {
  const options = parseArguments(process.argv.slice(2));
  const plan = options.resolvedPlanPath
    ? readResolvedDesktopCompositionPlan(options.resolvedPlanPath)
    : readDesktopComposition(
      options.active ? ACTIVE_DESKTOP_COMPOSITION_PATH : options.inputPath,
    );
  const value = options.format === 'vite-env'
    ? buildDesktopCompositionWebEnvironment(plan)
    : plan;
  const output = `${JSON.stringify(value, null, 2)}\n`;
  if (options.outputPath) {
    fs.writeFileSync(path.resolve(options.outputPath), output, 'utf8');
  } else {
    process.stdout.write(output);
  }
};

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  main();
}

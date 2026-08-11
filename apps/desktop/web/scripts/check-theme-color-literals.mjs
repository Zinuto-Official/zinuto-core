// SPDX-License-Identifier: GPL-3.0-only

import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';

const FRONTEND_ROOT = path.resolve('.');
const STYLES_ROOT = path.join(FRONTEND_ROOT, 'src', 'styles');
const SOURCE_ROOT = path.join(FRONTEND_ROOT, 'src');
const SCRIPTS_ROOT = path.join(FRONTEND_ROOT, 'scripts');
const COLOR_CENTER_PATH = path.join(
  SOURCE_ROOT,
  'ui',
  'theme',
  'visual',
  'colorCenter.json'
);
const SPECIAL_TRAINING_ASSET_ROOT = path.join(FRONTEND_ROOT, 'src', 'assets', 'graphics', 'assets', 'special-training');
const MANAGED_ANDROID_XML = path.resolve('..', 'shell', 'icons', 'android', 'values', 'ic_launcher_background.xml');
const COLOR_TOKEN_DIR = path.normalize(path.join('ui', 'theme', 'visual'));
const COLOR_TOKEN_COMPAT_FILE = path.normalize(path.join('ui', 'theme', 'visualColors.ts'));
const SCRIPT_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts']);
const GENERATED_MARKER = 'generated-from-color-center';
const VISUAL_COLOR_TOKEN_REFERENCE_RE =
  /\b(?:resolveVisualColorValue|resolveVisualHexChannels|toUpperHexDirective)\(\s*(['"])([^'"]+)\1/g;

const HEX_LITERAL_RE = /#[0-9a-fA-F]{3,8}\b/g;
const FN_LITERAL_RE = /(rgba?|hsla?)\((?![^)]*var\()[^)]*\d[^)]*\)/g;
const STANDALONE_CHANNEL_RE = /^\s*\d{1,3}\s+\d{1,3}\s+\d{1,3}(?:\s*\/\s*(?:\d+|\d*\.\d+))?\s*$/;
const FINANCIAL_DIRECTION_SOURCE_RULES = [
  {
    pathPrefix: path.normalize('src/workspaces/strategy-backtest/detail/charts'),
    tokenPattern: /\b(?:A1-Buy|A2-Sell|A3-Danger)\b/,
    message: 'backtest chart financial direction colors must use priceColorMode palettes, not trade/danger visual tokens'
  },
  {
    pathPrefix: path.normalize('src/workspaces/strategy-backtest'),
    tokenPattern: /\b(?:A1-Buy|A2-Sell|A3-Danger)\b/,
    message: 'strategy backtest financial direction colors must use price tokens or trade tokens by semantic lane'
  },
  {
    pathPrefix: path.normalize('src/workspaces/strategy-backtest/detail'),
    tokenPattern: /\btone:\s*["']danger["']|\bdata-tone=\{[^}\n]*["']danger["']/,
    message: 'strategy backtest detail financial tones must use positive/negative price tones, not danger'
  },
  {
    pathPrefix: path.normalize('src/workspaces/history/history-console'),
    tokenPattern: /--(?:state-positive|state-negative|danger-solid)\b/,
    message: 'financial replay archive/trend tones must use price tokens; status danger must use visual-danger-* tokens explicitly'
  }
];
const FINANCIAL_DIRECTION_CSS_RULES = [
  {
    relativeStylePath: path.normalize('workspaces/strategy-backtest.css'),
    selectorPattern:
      /(?:data-tone="(?:positive|negative)"|tone-(?:positive|negative)|strategy-backtest-result-row-return|strategy-backtest-fill-pnl|strategy-backtest-simple-metric-value)/,
    tokenPattern:
      /(?:rgb\(var\(--color-success\)\)|--visual-danger-(?:accent|solid)|--state-(?:positive|negative)|--trade-(?:buy|sell)-color)/,
    message: 'strategy backtest financial up/down tones must use --price-up-color / --price-down-color'
  },
  {
    relativeStylePath: path.normalize('workspaces/strategy-backtest.css'),
    selectorPattern:
      /(?:strategy-backtest-(?:simple-cards|kpi-strip|metric-table-row|distribution-stats)[^{]*(?:tone-danger|data-tone="danger")|strategy-backtest-batch-metric\[data-tone="danger"\])/,
    tokenPattern:
      /(?:--visual-danger-(?:accent|solid)|--danger\b|var\(--danger\)|--trade-(?:buy|sell)-color)/,
    message: 'strategy backtest financial metric danger tones must stay on price tokens; reserve danger for real failure states'
  },
  {
    relativeStylePath: path.normalize('layout/workspace-overrides/02-special-training-mode-config.css'),
    selectorPattern:
      /(?:is-gravity-(?:up|down)|mode-metric-value\.is-(?:up|down)|metric-value\.is-(?:up|down))/,
    tokenPattern:
      /(?:--visual-price-green-up-light|rgb\(var\(--color-success\)\)|--visual-danger-(?:accent|solid)|--trade-(?:buy|sell)-color)/,
    message: 'special-training financial HUD up/down tones must use price tokens'
  },
  {
    relativeStylePath: path.normalize('layout/workspace-overrides/02-special-training-risk-review.css'),
    selectorPattern:
      /(?:survival-hero\.is-(?:up|down)|risk-alpha-card\.(?:up|down)|(?:card-head|vital|metric|alpha-value|card-value)\.is-(?:up|down))/,
    tokenPattern:
      /(?:--visual-price-green-up-light|rgb\(var\(--color-success\)\)|--visual-danger-(?:accent|solid)|--trade-(?:buy|sell)-color)/,
    message: 'special-training risk review financial up/down tones must use price tokens'
  },
  {
    relativeStylePath: path.normalize('pages/diagnostic-center-archive-and-dialogs.css'),
    selectorPattern: /archive-financial-value/,
    tokenPattern: /--(?:state-positive|state-negative|visual-danger-accent)/,
    message: 'replay archive financial values must use price tokens, while destructive archive actions stay visual-danger'
  }
];

const walkFiles = (dir, predicate) => {
  if (!fs.existsSync(dir)) {
    return [];
  }
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const next = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(next, predicate));
      continue;
    }
    if (entry.isFile() && predicate(next)) {
      files.push(next);
    }
  }
  return files;
};

const toRelativeStylePath = (absolutePath) =>
  path.normalize(path.relative(STYLES_ROOT, absolutePath));

const toRelativeSourcePath = (absolutePath) =>
  path.normalize(path.relative(SOURCE_ROOT, absolutePath));

const toRelativeScriptPath = (absolutePath) =>
  path.normalize(path.relative(SCRIPTS_ROOT, absolutePath));

const collectLiteralMatches = (line) => {
  const matches = [];
  for (const match of line.matchAll(HEX_LITERAL_RE)) {
    matches.push(match[0]);
  }
  for (const match of line.matchAll(FN_LITERAL_RE)) {
    matches.push(match[0]);
  }
  return matches;
};

const shouldTreatAsRgbChannelLiteral = (decl) =>
  STANDALONE_CHANNEL_RE.test(decl.value) &&
  /^--(?:color|vip)-/i.test(decl.prop);

const collectCssViolations = (cssFilePath) => {
  const source = fs.readFileSync(cssFilePath, 'utf8');
  const root = postcss.parse(source, { from: cssFilePath });
  const violations = [];

  root.walkDecls((decl) => {
    const literalMatches = collectLiteralMatches(decl.value);
    const channelLiteral = shouldTreatAsRgbChannelLiteral(decl) ? [decl.value.trim()] : [];
    const matches = [...literalMatches, ...channelLiteral];
    if (matches.length === 0) {
      return;
    }

    const parent = decl.parent;
    const selector = parent?.type === 'rule' ? parent.selector : '';
    matches.forEach((token) => {
      violations.push({
        line: decl.source?.start?.line ?? 0,
        selector: selector || '[no-selector]',
        prop: decl.prop,
        value: decl.value,
        token
      });
    });
  });

  return violations;
};

const shouldSkipSourceScan = (relativeSourcePath) =>
  relativeSourcePath.startsWith(COLOR_TOKEN_DIR + path.sep) ||
  relativeSourcePath === COLOR_TOKEN_COMPAT_FILE;

const shouldSkipScriptScan = (relativeScriptPath) =>
  relativeScriptPath === path.normalize('sync-color-assets.mjs');

const collectScriptViolations = (scriptFilePath) => {
  const source = fs.readFileSync(scriptFilePath, 'utf8');
  const lines = source.split(/\r?\n/);
  const violations = [];
  lines.forEach((line, index) => {
    const matches = collectLiteralMatches(line);
    matches.forEach((token) => {
      violations.push({
        line: index + 1,
        token,
        snippet: line.trim().slice(0, 180)
      });
    });
  });
  return violations;
};

const collectUnknownVisualColorTokenReferences = (
  scriptFilePath,
  knownTokenIds
) => {
  const source = fs.readFileSync(scriptFilePath, 'utf8');
  const violations = [];
  for (const match of source.matchAll(VISUAL_COLOR_TOKEN_REFERENCE_RE)) {
    const tokenId = match[2];
    if (knownTokenIds.has(tokenId)) {
      continue;
    }
    violations.push({
      line: source.slice(0, match.index).split(/\r?\n/).length,
      tokenId
    });
  }
  return violations;
};

const collectFinancialDirectionScriptViolations = (scriptFilePath) => {
  const relativeSourcePath = path.normalize(
    path.join('src', toRelativeSourcePath(scriptFilePath))
  );
  const matchedRules = FINANCIAL_DIRECTION_SOURCE_RULES.filter((rule) =>
    relativeSourcePath.startsWith(rule.pathPrefix)
  );
  if (matchedRules.length === 0) {
    return [];
  }
  const source = fs.readFileSync(scriptFilePath, 'utf8');
  const lines = source.split(/\r?\n/);
  const violations = [];
  lines.forEach((line, index) => {
    matchedRules.forEach((rule) => {
      if (!rule.tokenPattern.test(line)) {
        return;
      }
      violations.push({
        file: relativeSourcePath,
        line: index + 1,
        snippet: line.trim().slice(0, 180),
        message: rule.message
      });
    });
  });
  return violations;
};

const collectFinancialDirectionCssViolations = (cssFilePath) => {
  const relativeStylePath = toRelativeStylePath(cssFilePath);
  const matchedRules = FINANCIAL_DIRECTION_CSS_RULES.filter(
    (rule) => relativeStylePath === rule.relativeStylePath
  );
  if (matchedRules.length === 0) {
    return [];
  }
  const source = fs.readFileSync(cssFilePath, 'utf8');
  const root = postcss.parse(source, { from: cssFilePath });
  const violations = [];
  root.walkDecls((decl) => {
    const selector = decl.parent?.type === 'rule' ? decl.parent.selector : '';
    matchedRules.forEach((rule) => {
      if (
        !rule.selectorPattern.test(selector) ||
        !rule.tokenPattern.test(decl.value)
      ) {
        return;
      }
      violations.push({
        file: path.join('src/styles', relativeStylePath),
        line: decl.source?.start?.line ?? 0,
        selector: selector || '[no-selector]',
        prop: decl.prop,
        value: decl.value,
        message: rule.message
      });
    });
  });
  return violations;
};

const collectAssetViolations = (assetFilePath) => {
  const source = fs.readFileSync(assetFilePath, 'utf8');
  if (source.includes(GENERATED_MARKER)) {
    return [];
  }
  const lines = source.split(/\r?\n/);
  const violations = [];
  lines.forEach((line, index) => {
    const matches = collectLiteralMatches(line);
    matches.forEach((token) => {
      violations.push({
        line: index + 1,
        token,
        snippet: line.trim().slice(0, 180)
      });
    });
  });
  return violations;
};

if (!fs.existsSync(STYLES_ROOT)) {
  console.error('[theme-color-check] styles directory not found:', STYLES_ROOT);
  process.exit(1);
}
if (!fs.existsSync(SOURCE_ROOT)) {
  console.error('[theme-color-check] source directory not found:', SOURCE_ROOT);
  process.exit(1);
}

const cssFiles = walkFiles(STYLES_ROOT, (filePath) => filePath.endsWith('.css'));
const sourceScriptFiles = walkFiles(SOURCE_ROOT, (filePath) => SCRIPT_EXTENSIONS.has(path.extname(filePath)));
const toolScriptFiles = walkFiles(SCRIPTS_ROOT, (filePath) => SCRIPT_EXTENSIONS.has(path.extname(filePath)));
const assetFiles = [
  ...walkFiles(SPECIAL_TRAINING_ASSET_ROOT, (filePath) => filePath.endsWith('.svg')),
  ...(fs.existsSync(MANAGED_ANDROID_XML) ? [MANAGED_ANDROID_XML] : [])
];
const allViolations = [];
const financialDirectionViolations = [];
const colorCenterEntries = JSON.parse(fs.readFileSync(COLOR_CENTER_PATH, 'utf8'));
const knownVisualColorTokenIds = new Set(
  colorCenterEntries.map((entry) => entry.id)
);
const unknownVisualColorTokenReferences = [];

for (const scriptFilePath of sourceScriptFiles) {
  const relativeSourcePath = toRelativeSourcePath(scriptFilePath);
  collectUnknownVisualColorTokenReferences(
    scriptFilePath,
    knownVisualColorTokenIds
  ).forEach((item) => {
    unknownVisualColorTokenReferences.push({
      file: path.join('src', relativeSourcePath),
      ...item
    });
  });
}

for (const cssFilePath of cssFiles) {
  const relativeStylePath = toRelativeStylePath(cssFilePath);
  const fileViolations = collectCssViolations(cssFilePath);
  fileViolations.forEach((item) => {
    allViolations.push({
      kind: 'css',
      file: path.join('src/styles', relativeStylePath),
      token: item.token,
      ...item
    });
  });
  financialDirectionViolations.push(
    ...collectFinancialDirectionCssViolations(cssFilePath)
  );
}

for (const scriptFilePath of sourceScriptFiles) {
  const relativeSourcePath = toRelativeSourcePath(scriptFilePath);
  if (shouldSkipSourceScan(relativeSourcePath)) {
    continue;
  }
  const fileViolations = collectScriptViolations(scriptFilePath);
  fileViolations.forEach((item) => {
    allViolations.push({
      kind: 'script',
      file: path.join('src', relativeSourcePath),
      ...item
    });
  });
  financialDirectionViolations.push(
    ...collectFinancialDirectionScriptViolations(scriptFilePath)
  );
}

for (const scriptFilePath of toolScriptFiles) {
  const relativeScriptPath = toRelativeScriptPath(scriptFilePath);
  if (shouldSkipScriptScan(relativeScriptPath)) {
    continue;
  }
  const fileViolations = collectScriptViolations(scriptFilePath);
  fileViolations.forEach((item) => {
    allViolations.push({
      kind: 'script',
      file: path.join('scripts', relativeScriptPath),
      ...item
    });
  });
}

for (const assetFilePath of assetFiles) {
  const relativeAssetPath = path.normalize(path.relative(FRONTEND_ROOT, assetFilePath));
  const relativeCrossWorkspaceAssetPath = assetFilePath.startsWith(FRONTEND_ROOT)
    ? relativeAssetPath
    : path.normalize(path.relative(path.resolve('..'), assetFilePath));
  const fileViolations = collectAssetViolations(assetFilePath);
  fileViolations.forEach((item) => {
    allViolations.push({
      kind: 'asset',
      file: assetFilePath.startsWith(FRONTEND_ROOT)
        ? relativeAssetPath
        : path.join('..', relativeCrossWorkspaceAssetPath),
      ...item
    });
  });
}

if (allViolations.length > 0) {
  console.error('[theme-color-check] Found hardcoded color literals outside managed color-center sources:');
  allViolations.forEach((item) => {
    if (item.kind === 'css') {
      console.error(
        `  - ${item.file}:${item.line} | ${item.selector} | ${item.prop}: ${item.value} [${item.token}]`
      );
      return;
    }
    console.error(
      `  - ${item.file}:${item.line} | ${item.snippet} [${item.token}]`
    );
  });
  console.error(
    '[theme-color-check] Fix: move the literal into `src/ui/theme/visual/colorCenter.json` (or mark the file as a generated asset synced from the color center).'
  );
  process.exit(1);
}

if (unknownVisualColorTokenReferences.length > 0) {
  console.error('[theme-color-check] Found references to unknown visual color tokens:');
  unknownVisualColorTokenReferences.forEach((item) => {
    console.error(`  - ${item.file}:${item.line} | ${item.tokenId}`);
  });
  console.error(
    '[theme-color-check] Fix: add each token to `src/ui/theme/visual/colorCenter.json` or use an existing managed token.'
  );
  process.exit(1);
}

if (financialDirectionViolations.length > 0) {
  console.error('[theme-color-check] Found financial direction color token misuse:');
  financialDirectionViolations.forEach((item) => {
    if ('selector' in item) {
      console.error(
        `  - ${item.file}:${item.line} | ${item.selector} | ${item.prop}: ${item.value} | ${item.message}`
      );
      return;
    }
    console.error(
      `  - ${item.file}:${item.line} | ${item.snippet} | ${item.message}`
    );
  });
  console.error(
    '[theme-color-check] Fix: price/PnL/return up/down colors must use --price-up-color / --price-down-color or getPriceColorPalette(priceColorMode); buy/sell actions must use trade tokens only; risk/status danger may use visual-danger tokens.'
  );
  process.exit(1);
}

console.log('[theme-color-check] ✅ no unmanaged color literals outside the color center or generated asset outputs.');

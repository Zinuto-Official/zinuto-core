#!/usr/bin/env node

// SPDX-License-Identifier: GPL-3.0-only

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveDesktopComposition } from '../release/desktop-composition.mjs';
import { validateDesktopFeatureManifest } from '../release/feature-manifest.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const defaultRootDir = path.resolve(path.dirname(scriptPath), '../..');

const forbiddenPaths = [
  'apps/account',
  'apps/admin-android',
  'apps/marketing',
  'apps/desktop/mcp-server',
  'apps/desktop/shell/apple_iap_bridge',
  'apps/desktop/shell/apple_auth_bridge',
  'apps/desktop/shell/apple_support_bridge',
  'apps/desktop/shell/Entitlements.official.plist',
  'apps/desktop/shell/official-capabilities',
  'apps/desktop/shell/xcode-dev',
  'apps/desktop/shell/Zinuto.xcworkspace',
  'apps/desktop/web/src/domains/desktop-notices',
  'apps/desktop/web/src/domains/desktop-updates',
  'apps/desktop/web/src/domains/official-account',
  'contracts/official-service.v1.yaml',
  'config/brand/official-overlay.json',
  'packages/shared/src/contracts-official',
  'tools/release/official-desktop.mjs',
  'tools/release/official-desktop.test.mjs',
  'ops',
  '.gitmodules',
];

const forbiddenReleaseFiles = [
  /(?:^|\/)(?:appstore|codesign|notarize|sign-macos|direct-macos-distribution|desktop-release-gate|prepare-xcode)/iu,
  /(?:^|\/)prepare-bundled-account-config\.mjs$/u,
];

const skippedDirectoryNames = new Set([
  '.git',
  '.cache',
  'coverage',
  'dist',
  'gen',
  'node_modules',
  '.venv',
  'target',
  'test-results',
]);

const skippedRepoPaths = new Set([
  'apps/desktop/shell/runtime',
]);

const sourceExtensions = new Set([
  '.cjs', '.css', '.html', '.js', '.json', '.jsx', '.md', '.mjs', '.mts',
  '.nsh', '.plist', '.rs', '.toml', '.ts', '.tsx', '.yaml', '.yml',
]);

const privateRuntimeMarkers = Object.freeze([
  '/account-service',
  '/desktop/release-manifest.json',
  '.update-smoke',
  'ZINUTO_UPDATE_SMOKE_BUILD',
  'ZINUTO_DESKTOP_BUNDLE_ID',
  'accountSession',
  'accountCallbackScheme',
  'Alipay',
  'apple_auth_bridge',
  'apple_support_bridge',
  'clientPresence',
  'desktopUpdate',
  'direct-macos',
  'direct-windows',
  'hostedCheckout',
  'Ko-fi',
  'microsoft-store',
  'oauthClaim',
  'openExternalUrl',
  'opener:default',
  'officialAccount',
  'official packaging',
  'officialService',
  'official_service',
  'paymentOrder',
  'releaseIdentityId',
  'serviceBaseUrl',
  'StoreKit',
  'supportCatalog',
  'supporterBadge',
  'tauri-plugin-updater',
  'updaterEndpoints',
  'websiteBaseUrl',
  'www.zinuto.com',
  'ZINUTO_OFFICIAL',
]);

const privateRuntimeSourcePrefixes = [
  '.github/',
  'apps/desktop/',
  'contracts/',
  'packages/shared/src/',
  'config/brand/',
];

const publicSupportMetadataPaths = new Set([
  '.github/FUNDING.yml',
  '.github/ISSUE_TEMPLATE/config.yml',
]);

const publicSupportMetadataMarkers = new Set([
  'Alipay',
  'Ko-fi',
  'www.zinuto.com',
]);

const forbiddenWorkflowPatterns = Object.freeze([
  [/(?:^|\s)contents:\s*write\b/iu, 'write access to repository contents'],
  [/\bgh\s+release\b/iu, 'GitHub Release command'],
  [/softprops\/action-gh-release|actions\/create-release|actions\/upload-release-asset/iu, 'GitHub Release action'],
  [/APPLE_SIGNING_IDENTITY|TAURI_SIGNING_PRIVATE_KEY|certificateThumbprint|signingIdentity/iu, 'signing input'],
]);

export const findForbiddenCoreWorkflowBehavior = (content) => {
  const source = String(content ?? '');
  for (const [pattern, label] of forbiddenWorkflowPatterns) {
    if (pattern.test(source)) return label;
  }
  if (
    /actions\/upload-artifact/iu.test(source)
    && /(?:\.dmg|\.exe|desktop:build|npm\s+run\s+package|target\/release\/bundle)/iu.test(source)
  ) {
    return 'desktop binary artifact upload';
  }
  if (!/(?:^|\n)permissions:\s*\n\s+contents:\s*read\b/iu.test(source)) {
    return 'missing explicit contents: read permission';
  }
  return null;
};

const forbiddenSigningConfigurationPatterns = Object.freeze([
  /["']signingIdentity["']\s*:/u,
  /["']certificateThumbprint["']\s*:/u,
  /["']signCommand["']\s*:/u,
  /["']createUpdaterArtifacts["']\s*:/u,
]);

export const findForbiddenCoreSigningConfiguration = (content) => {
  const source = String(content ?? '');
  return forbiddenSigningConfigurationPatterns.find((pattern) => pattern.test(source))?.source ?? null;
};

export const findPrivateRuntimeMarker = ({ relativePath, content }) => {
  if (!privateRuntimeSourcePrefixes.some((prefix) => relativePath.startsWith(prefix))) {
    return null;
  }
  const allowsPublicSupportMetadata = publicSupportMetadataPaths.has(relativePath);
  return privateRuntimeMarkers.find((candidate) => (
    content.includes(candidate)
    && !(allowsPublicSupportMetadata && publicSupportMetadataMarkers.has(candidate))
  )) ?? null;
};

const toRepoPath = (rootDir, absolutePath) =>
  path.relative(rootDir, absolutePath).split(path.sep).join('/');

export const containsVisibleOfficialBrand = (html) => {
  const visibleMarkup = html
    .replace(/<!--[\s\S]*?-->/gu, '')
    .replace(/<(?:script|style)\b[^>]*>[\s\S]*?<\/(?:script|style)>/giu, '')
    .replace(/\bZinuto Core\b/giu, 'COMMUNITY_PRODUCT');
  return (
    /<title\b[^>]*>[^<]*\bZinuto\b/iu.test(visibleMarkup)
    || /\b(?:aria-label|title)\s*=\s*(["'])[^"']*\bZinuto\b[^"']*\1/iu.test(visibleMarkup)
    || />[^<]*\bZinuto\b[^<]*</iu.test(visibleMarkup)
  );
};

const DOCUMENTED_NPM_RUN_PATTERN =
  /\bnpm\s+run\s+([A-Za-z0-9][A-Za-z0-9:_-]*)([^\n`]*)/gu;
const DOCUMENTED_WORKSPACE_PATTERN =
  /(?:^|\s)--workspace(?:=|\s+)(@[A-Za-z0-9._/-]+|[A-Za-z0-9._/-]+)/u;

export const findInvalidDocumentedNpmScripts = ({
  documents,
  rootScripts,
  workspaceScriptsByName,
}) => {
  const failures = [];
  for (const [relativePath, content] of documents) {
    for (const match of String(content).matchAll(DOCUMENTED_NPM_RUN_PATTERN)) {
      const scriptName = match[1];
      const trailingCommand = match[2] ?? '';
      if (scriptName.endsWith(':') && trailingCommand.trimStart().startsWith('*')) {
        continue;
      }
      const workspaceName =
        trailingCommand.match(DOCUMENTED_WORKSPACE_PATTERN)?.[1] ?? null;
      if (workspaceName) {
        const workspaceScripts = workspaceScriptsByName.get(workspaceName);
        if (!workspaceScripts) {
          failures.push(
            `${relativePath}: documented npm workspace does not exist: ${workspaceName}`,
          );
        } else if (!Object.hasOwn(workspaceScripts, scriptName)) {
          failures.push(
            `${relativePath}: documented npm script does not exist in ${workspaceName}: ${scriptName}`,
          );
        }
        continue;
      }
      if (!Object.hasOwn(rootScripts, scriptName)) {
        failures.push(
          `${relativePath}: documented root npm script does not exist: ${scriptName}`,
        );
      }
    }
  }
  return failures;
};

export const walkPublicTree = ({
  rootDir,
  skippedNames = skippedDirectoryNames,
  skippedPaths = skippedRepoPaths,
}) => {
  const files = [];
  const failures = [];

  const visit = (directory) => {
    for (const name of fs.readdirSync(directory).sort((left, right) => left.localeCompare(right))) {
      const absolutePath = path.join(directory, name);
      const relativePath = toRepoPath(rootDir, absolutePath);
      const stat = fs.lstatSync(absolutePath);

      if (stat.isSymbolicLink()) {
        failures.push(`symbolic link is forbidden in public source: ${relativePath}`);
        continue;
      }
      if (stat.isDirectory()) {
        if (!skippedNames.has(name) && !skippedPaths.has(relativePath)) {
          visit(absolutePath);
        }
        continue;
      }
      if (!stat.isFile()) {
        failures.push(`special filesystem entry is forbidden in public source: ${relativePath}`);
        continue;
      }
      files.push(absolutePath);
    }
  };

  visit(rootDir);
  return { failures, files };
};

export const inspectPublicRepository = (rootDir = defaultRootDir) => {
  const failures = [];

  for (const relativePath of forbiddenPaths) {
    if (fs.existsSync(path.join(rootDir, relativePath))) {
      failures.push(`private or removed product path is present: ${relativePath}`);
    }
  }

  const trackedOfficialOutputs = spawnSync(
    'git',
    ['ls-files', '-z', '--', 'apps/desktop/shell/gen/official-build'],
    { cwd: rootDir, encoding: 'utf8' },
  );
  if (trackedOfficialOutputs.status === 0 && String(trackedOfficialOutputs.stdout ?? '').length > 0) {
    failures.push('generated official-build outputs must never be tracked in public source');
  }

  const trackedVirtualEnvironmentFiles = spawnSync(
    'git',
    ['ls-files', '-z', '--', ':(glob)**/.venv/**'],
    { cwd: rootDir, encoding: 'utf8' },
  );
  if (
    trackedVirtualEnvironmentFiles.status === 0
    && String(trackedVirtualEnvironmentFiles.stdout ?? '').length > 0
  ) {
    failures.push('local Python virtual-environment files must never be tracked in public source');
  }

  const tree = walkPublicTree({ rootDir });
  failures.push(...tree.failures);

  for (const absolutePath of tree.files) {
    const relativePath = toRepoPath(rootDir, absolutePath);
    if (forbiddenReleaseFiles.some((pattern) => pattern.test(relativePath))) {
      failures.push(`private release operation is present: ${relativePath}`);
    }
    if (/\.(?:cer|crt|key|mobileprovision|p12|pfx)$/iu.test(relativePath)) {
      failures.push(`signing or certificate material is forbidden in public source: ${relativePath}`);
    }
    if (
      /\.(?:png|jpe?g|gif|ico|icns|svg)$/iu.test(relativePath)
      && /zinuto/iu.test(path.basename(relativePath))
      && relativePath !== 'config/brand/assets/zinuto-core-logo.png'
    ) {
      failures.push(`official branded image is present in the community source tree: ${relativePath}`);
    }
    if (!sourceExtensions.has(path.extname(relativePath).toLowerCase())) {
      continue;
    }
    if (relativePath === 'tools/open-source/check-public-repo.mjs') {
      continue;
    }
    const content = fs.readFileSync(absolutePath, 'utf8');
    if (
      (relativePath.startsWith('apps/desktop/shell/') || relativePath.startsWith('config/brand/'))
      && findForbiddenCoreSigningConfiguration(content)
    ) {
      failures.push(`signing configuration is forbidden in public Core source: ${relativePath}`);
    }
    if (
      path.extname(relativePath).toLowerCase() === '.html'
      && containsVisibleOfficialBrand(content)
    ) {
      failures.push(`official brand is visible in public community HTML: ${relativePath}`);
    }
    if (/\/Users\//u.test(content) || /[A-Za-z]:\\Users\\/u.test(content)) {
      failures.push(`machine-specific user path is present: ${relativePath}`);
    }
    if (/(?:^|[/\\])(?:WorkSync|AppleStore)(?:[/\\]|$)/u.test(content)) {
      failures.push(`private workspace path marker is present: ${relativePath}`);
    }
    if (/ジヌート|지누토/u.test(content)) {
      failures.push(`official brand transliteration is present in community source: ${relativePath}`);
    }
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u.test(content)) {
      failures.push(`private key material is present: ${relativePath}`);
    }
    const privateRuntimeMarker = findPrivateRuntimeMarker({ relativePath, content });
    if (privateRuntimeMarker) {
      failures.push(`private runtime marker ${privateRuntimeMarker} is present: ${relativePath}`);
    }
  }

  const readJson = (relativePath) =>
    JSON.parse(fs.readFileSync(path.join(rootDir, relativePath), 'utf8'));
  const expectedCommunityComposition = {
    compositionProtocolVersion: 1,
    distributionId: 'community',
    targetPlatform: 'host',
    productName: 'Zinuto Core',
    bundleIdentifier: 'org.zinuto.core',
  };

  for (const relativePath of ['config/brand/community.json', 'config/brand/active.json']) {
    const actual = readJson(relativePath);
    if (JSON.stringify(actual) !== JSON.stringify(expectedCommunityComposition)) {
      failures.push(`${relativePath} must be the exact disconnected community composition input`);
      continue;
    }
    try {
      const composition = resolveDesktopComposition(actual);
      if (
        composition.distributionId !== 'community'
        || composition.brand.profile !== 'community'
        || composition.tauri.features.length !== 0
        || composition.tauri.additionalCapabilities.length !== 0
      ) {
        failures.push(`${relativePath} must resolve to the community composition`);
      }
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }

  const tauriConfig = readJson('apps/desktop/shell/tauri.conf.json');
  if (tauriConfig.productName !== expectedCommunityComposition.productName) {
    failures.push('tauri.conf.json must default to the community product name');
  }
  if (tauriConfig.identifier !== expectedCommunityComposition.bundleIdentifier) {
    failures.push('tauri.conf.json must default to the community bundle identifier');
  }
  if (tauriConfig.app?.windows?.some((window) => window?.devtools !== false)) {
    failures.push('community Tauri windows must explicitly disable devtools');
  }
  const defaultCapability = readJson('apps/desktop/shell/capabilities/default.json');
  const capabilityPermissions = defaultCapability.permissions ?? [];
  if (capabilityPermissions.includes('opener:default')) {
    failures.push('community Tauri capability must not grant opener:default');
  }
  const scopedUrlPermission = capabilityPermissions.find(
    (permission) =>
      permission
      && typeof permission === 'object'
      && permission.identifier === 'opener:allow-open-url',
  );
  const expectedMarketDataUrls = [
    'https://github.com/**',
    'https://akshare.akfamily.xyz/**',
    'https://about.eastmoney.com/**',
    'https://www.binance.com/**',
    'https://developers.binance.com/**',
    'https://www.okx.com/**',
  ];
  const actualMarketDataUrls = Array.isArray(scopedUrlPermission?.allow)
    ? scopedUrlPermission.allow.map((entry) => entry?.url).filter(Boolean)
    : [];
  if (JSON.stringify(actualMarketDataUrls) !== JSON.stringify(expectedMarketDataUrls)) {
    failures.push(
      'community Tauri URL opener scope must contain only the reviewed market-data documentation hosts',
    );
  }

  const rootPackage = readJson('package.json');
  const expectedWorkspaces = [
    'apps/desktop/web',
    'apps/desktop/local-api',
    'packages/shared',
  ];
  if (JSON.stringify(rootPackage.workspaces) !== JSON.stringify(expectedWorkspaces)) {
    failures.push('root npm workspaces must contain only the public desktop packages');
  }
  if (rootPackage.license !== 'GPL-3.0-only') {
    failures.push('root package license must be GPL-3.0-only');
  }
  const workspaceScriptsByName = new Map();
  for (const workspacePath of rootPackage.workspaces ?? []) {
    const workspacePackage = readJson(`${workspacePath}/package.json`);
    const forbiddenDependencies = [
      '@tauri-apps/plugin-deep-link',
      '@tauri-apps/plugin-process',
      '@tauri-apps/plugin-updater',
    ];
    for (const dependency of forbiddenDependencies) {
      if (
        Object.hasOwn(workspacePackage.dependencies ?? {}, dependency)
        || Object.hasOwn(workspacePackage.devDependencies ?? {}, dependency)
      ) {
        failures.push(`${workspacePath}/package.json must not depend on ${dependency}`);
      }
    }
    workspaceScriptsByName.set(
      workspacePackage.name,
      workspacePackage.scripts ?? {},
    );
  }
  const markdownDocuments = tree.files
    .filter((absolutePath) => path.extname(absolutePath).toLowerCase() === '.md')
    .map((absolutePath) => [
      toRepoPath(rootDir, absolutePath),
      fs.readFileSync(absolutePath, 'utf8'),
    ]);
  failures.push(...findInvalidDocumentedNpmScripts({
    documents: markdownDocuments,
    rootScripts: rootPackage.scripts ?? {},
    workspaceScriptsByName,
  }));

  const workflowRoot = path.join(rootDir, '.github', 'workflows');
  if (fs.existsSync(workflowRoot)) {
    for (const entry of fs.readdirSync(workflowRoot, { withFileTypes: true })) {
      if (!entry.isFile() || !/\.ya?ml$/iu.test(entry.name)) continue;
      const relativePath = `.github/workflows/${entry.name}`;
      const behavior = findForbiddenCoreWorkflowBehavior(
        fs.readFileSync(path.join(workflowRoot, entry.name), 'utf8'),
      );
      if (behavior) {
        failures.push(`Core workflow contains forbidden ${behavior}: ${relativePath}`);
      }
    }
  }
  try {
    validateDesktopFeatureManifest(readJson('config/feature-manifest.json'), {
      expectedProductVersion: rootPackage.version,
    });
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }

  return { failures, inspectedFileCount: tree.files.length };
};

const main = () => {
  const result = inspectPublicRepository();
  if (result.failures.length > 0) {
    process.stderr.write(`[public-repo] failed (${result.failures.length})\n`);
    result.failures.forEach((failure) => process.stderr.write(`- ${failure}\n`));
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`[public-repo] passed (${result.inspectedFileCount} source-tree files inspected)\n`);
};

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main();
}

// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { collectMissingTauriBuildInputs } from './ensure-tauri-build-inputs.mjs';
import {
  findUnexpectedAkshareSidecarPackagePaths,
  stageAkshareSidecarPackageInput,
} from './market-data-acquisition-runtime.mjs';
import {
  inspectAkshareSidecarBundle,
  isRegularAkshareSidecarExecutable,
  parseNativeRuntimeValidationArguments,
  resolveNativeRuntimeValidationPolicy,
  resolveAkshareSidecarTargetId,
} from './validate-native-runtime.mjs';

const communityComposition = {
  protocolVersion: 1,
  distributionId: 'community',
  targetPlatform: 'host',
  brand: {
    profile: 'community',
    productName: 'Zinuto Core',
    bundleIdentifier: 'org.zinuto.core',
  },
};

test('runtime validation derives behavior from the active resolved composition', () => {
  assert.deepEqual(
    parseNativeRuntimeValidationArguments(['--mode', 'build']),
    { mode: 'build' },
  );
  assert.deepEqual(
    resolveNativeRuntimeValidationPolicy({
      composition: communityComposition,
    }),
    { distributionId: 'community' },
  );
  assert.throws(
    () => parseNativeRuntimeValidationArguments(['--legacy-distribution']),
    /Unknown native runtime validation option/u,
  );
  assert.throws(
    () => resolveNativeRuntimeValidationPolicy({
      composition: { distributionId: 'unsupported' },
    }),
    /requires the community composition/u,
  );
});

test('Tauri build preparation stages the sidecar before validating declared resources', () => {
  for (const scriptName of ['prepare-tauri-build.mjs', 'prepare-tauri-dev.mjs']) {
    const source = fs.readFileSync(new URL(`./${scriptName}`, import.meta.url), 'utf8');
    const sidecarBuildIndex = source.indexOf('akshare-sidecar:build');
    const validationIndex = source.indexOf('validate-native-runtime.mjs');
    assert.notEqual(sidecarBuildIndex, -1, `${scriptName} must build the sidecar`);
    assert.notEqual(validationIndex, -1, `${scriptName} must validate the staged runtime`);
    assert.equal(sidecarBuildIndex < validationIndex, true);
    assert.match(
      source,
      /readActiveDesktopCompositionPlan/u,
      `${scriptName} must derive its profile from the resolved composition`,
    );
  }

  const backendBundlePreparer = fs.readFileSync(new URL(
    './prepare-backend-runtime-bundle.mjs',
    import.meta.url,
  ), 'utf8');
  assert.doesNotMatch(
    backendBundlePreparer,
    /officialBuild|ZINUTO_OFFICIAL|account-service/u,
  );

  const sidecarBuilder = fs.readFileSync(new URL(
    '../../apps/desktop/local-api/scripts/build-akshare-sidecar.mjs',
    import.meta.url,
  ), 'utf8');
  assert.match(sidecarBuilder, /stageAkshareSidecarPackageInput/u);

  for (const configName of ['tauri.conf.json', 'tauri.windows.conf.json']) {
    const config = JSON.parse(fs.readFileSync(new URL(
      `../../apps/desktop/shell/${configName}`,
      import.meta.url,
    ), 'utf8'));
    assert.equal(
      config.bundle.resources['gen/market-data-acquisition/'],
      'market-data-acquisition/',
    );
  }

  const windowsNsisHook = fs.readFileSync(new URL(
    '../../apps/desktop/shell/nsis/windows-runtime-resources.nsh',
    import.meta.url,
  ), 'utf8');
  for (const fragment of [
    'RMDir /r "$INSTDIR\\market-data-acquisition"',
    'SetOutPath "$INSTDIR\\market-data-acquisition"',
    'gen\\market-data-acquisition\\*',
  ]) {
    assert.equal(
      windowsNsisHook.includes(fragment),
      true,
      `Windows NSIS hook must preserve the AKShare sidecar resource: ${fragment}`,
    );
  }

  const windowsInstallerValidator = fs.readFileSync(new URL(
    './validate-windows-nsis-installer.mjs',
    import.meta.url,
  ), 'utf8');
  assert.match(windowsInstallerValidator, /'zinuto-core\.exe'/u);
  assert.match(
    windowsInstallerValidator,
    /market-data-acquisition\/akshare-sidecar\/win32-x64\/zinuto-akshare-sidecar\.exe/u,
  );

  const backendRuntimeBundler = fs.readFileSync(new URL(
    './prepare-backend-runtime-bundle.mjs',
    import.meta.url,
  ), 'utf8');
  const freshnessCheckStart = backendRuntimeBundler.indexOf(
    "label: 'backend dist output'",
  );
  const acquireBuildLockStart = backendRuntimeBundler.indexOf(
    'acquireBuildLock();',
    freshnessCheckStart,
  );
  const backendFreshnessCheck = backendRuntimeBundler.slice(
    freshnessCheckStart,
    acquireBuildLockStart,
  );
  assert.match(backendFreshnessCheck, /path\.join\(BACKEND_DIR, 'src'\)/u);
  assert.doesNotMatch(backendFreshnessCheck, /BACKEND_PACKAGE_JSON/u);
  assert.match(backendRuntimeBundler, /copyPath\(BACKEND_PACKAGE_JSON/u);
  assert.match(
    backendRuntimeBundler,
    /schemaVersion: FRESHNESS_FINGERPRINT_SCHEMA_VERSION/u,
  );
});

test('AKShare onedir validation requires the target executable and critical runtime data', (t) => {
  const generatedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zinuto-native-runtime-'));
  t.after(() => fs.rmSync(generatedRoot, { recursive: true, force: true }));
  const targetId = resolveAkshareSidecarTargetId('darwin', 'arm64');
  assert.equal(targetId, 'darwin-arm64');
  const bundleRoot = path.join(
    generatedRoot,
    'market-data-acquisition',
    'akshare-sidecar',
    targetId,
  );
  const requiredFiles = [
    ['zinuto-akshare-sidecar'],
    ['_internal', 'base_library.zip'],
    ['_internal', 'akshare', 'file_fold', 'calendar.json'],
    ['_internal', 'akshare-1.18.64.dist-info', 'METADATA'],
    ['_internal', 'aktools-0.0.91.dist-info', 'METADATA'],
  ];
  for (const segments of requiredFiles) {
    const filePath = path.join(bundleRoot, ...segments);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, 'fixture');
  }
  const executablePath = path.join(bundleRoot, 'zinuto-akshare-sidecar');
  fs.chmodSync(executablePath, 0o755);

  assert.deepEqual(
    inspectAkshareSidecarBundle({
      generatedRoot,
      nodePlatform: 'darwin',
      nodeArch: 'arm64',
      akshareVersion: '1.18.64',
      aktoolsVersion: '0.0.91',
    }).invalidPaths,
    [],
  );
  assert.equal(isRegularAkshareSidecarExecutable(executablePath, 'darwin'), true);

  fs.rmSync(path.join(bundleRoot, '_internal', 'akshare', 'file_fold', 'calendar.json'));
  const invalid = inspectAkshareSidecarBundle({
    generatedRoot,
    nodePlatform: 'darwin',
    nodeArch: 'arm64',
    akshareVersion: '1.18.64',
    aktoolsVersion: '0.0.91',
  }).invalidPaths;
  assert.equal(
    invalid.includes(
      path.join(bundleRoot, '_internal', 'akshare', 'file_fold', 'calendar.json'),
    ),
    true,
  );
});

test('AKShare onedir validation rejects a non-executable or symlinked launcher', (t) => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zinuto-sidecar-exec-'));
  t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));
  const target = path.join(fixtureRoot, 'target');
  const link = path.join(fixtureRoot, 'link');
  fs.writeFileSync(target, 'fixture');
  fs.chmodSync(target, 0o644);
  fs.symlinkSync(target, link);
  assert.equal(isRegularAkshareSidecarExecutable(target, 'darwin'), false);
  assert.equal(isRegularAkshareSidecarExecutable(link, 'darwin'), false);
  assert.equal(isRegularAkshareSidecarExecutable(target, 'win32'), true);
});

test('AKShare package staging removes every stale target before publishing the current one', (t) => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zinuto-sidecar-stage-'));
  t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));
  const generatedRoot = path.join(fixtureRoot, 'gen');
  const acquisitionRoot = path.join(generatedRoot, 'market-data-acquisition');
  const staleTarget = path.join(acquisitionRoot, 'akshare-sidecar', 'win32-x64');
  fs.mkdirSync(staleTarget, { recursive: true });
  fs.writeFileSync(path.join(staleTarget, 'zinuto-akshare-sidecar.exe'), 'stale');
  fs.writeFileSync(path.join(acquisitionRoot, 'unexpected.txt'), 'stale');

  const sourceBundleRoot = path.join(fixtureRoot, 'built-sidecar');
  fs.mkdirSync(sourceBundleRoot, { recursive: true });
  fs.writeFileSync(path.join(sourceBundleRoot, 'zinuto-akshare-sidecar'), 'current');
  const staged = stageAkshareSidecarPackageInput({
    generatedRoot,
    sourceBundleRoot,
    nodePlatform: 'darwin',
    nodeArch: 'arm64',
  });

  assert.equal(fs.existsSync(staleTarget), false);
  assert.equal(fs.existsSync(path.join(acquisitionRoot, 'unexpected.txt')), false);
  assert.equal(fs.readFileSync(staged.executablePath, 'utf8'), 'current');
  assert.deepEqual(fs.readdirSync(acquisitionRoot), ['akshare-sidecar']);
  assert.deepEqual(fs.readdirSync(staged.connectorRoot), ['darwin-arm64']);
});

test('AKShare package validation rejects stale targets and unexpected packaged files', (t) => {
  const generatedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zinuto-sidecar-layout-'));
  t.after(() => fs.rmSync(generatedRoot, { recursive: true, force: true }));
  const acquisitionRoot = path.join(generatedRoot, 'market-data-acquisition');
  const staleTarget = path.join(acquisitionRoot, 'akshare-sidecar', 'win32-x64');
  const unexpectedFile = path.join(acquisitionRoot, 'unexpected.txt');
  fs.mkdirSync(staleTarget, { recursive: true });
  fs.writeFileSync(path.join(staleTarget, 'zinuto-akshare-sidecar.exe'), 'stale');
  fs.writeFileSync(unexpectedFile, 'stale');

  assert.deepEqual(
    new Set(findUnexpectedAkshareSidecarPackagePaths({
      generatedRoot,
      nodePlatform: 'darwin',
      nodeArch: 'arm64',
    })),
    new Set([staleTarget, unexpectedFile]),
  );
  const inspected = inspectAkshareSidecarBundle({
    generatedRoot,
    nodePlatform: 'darwin',
    nodeArch: 'arm64',
    akshareVersion: '1.18.64',
    aktoolsVersion: '0.0.91',
  });
  assert.equal(inspected.invalidPaths.includes(staleTarget), true);
  assert.equal(inspected.invalidPaths.includes(unexpectedFile), true);
});

test('direct Tauri input checks require the executable for the selected platform', (t) => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zinuto-tauri-inputs-'));
  t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));
  const manifestPath = path.join(
    rootDir,
    'config',
    'open-source',
    'python-sidecar-dependencies.json',
  );
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify({
    requiredRootPackages: [
      { name: 'akshare', version: '1.18.64' },
      { name: 'aktools', version: '0.0.91' },
    ],
  }));

  const macMissing = collectMissingTauriBuildInputs({
    rootDir,
    nodePlatform: 'darwin',
    nodeArch: 'arm64',
  });
  assert.equal(macMissing.includes(path.join(
    rootDir,
    'apps',
    'desktop',
    'shell',
    'gen',
    'market-data-acquisition',
    'akshare-sidecar',
    'darwin-arm64',
    'zinuto-akshare-sidecar',
  )), true);

  const windowsMissing = collectMissingTauriBuildInputs({
    rootDir,
    nodePlatform: 'win32',
    nodeArch: 'x64',
  });
  assert.equal(windowsMissing.includes(path.join(
    rootDir,
    'apps',
    'desktop',
    'shell',
    'gen',
    'market-data-acquisition',
    'akshare-sidecar',
    'win32-x64',
    'zinuto-akshare-sidecar.exe',
  )), true);
});

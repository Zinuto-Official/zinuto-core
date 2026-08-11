// SPDX-License-Identifier: GPL-3.0-only

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { BUNDLE_DIR, RELEASE_TARGET_DIR } from './desktop-command-utils.mjs';

const run = (command, args, { env = process.env, input } = {}) => spawnSync(command, args, {
  encoding: 'utf8',
  env,
  input,
});

const runRequired = (command, args, label) => {
  const result = run(command, args);
  if (result.status !== 0 || result.error) {
    throw new Error(`[local-package] ${label} failed: ${combinedOutput(result)}`);
  }
  return result;
};

const combinedOutput = (result) => `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim();

const exactlyOne = (directory, predicate, label) => {
  const matches = fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && predicate(entry.name))
    .map((entry) => path.join(directory, entry.name));
  if (matches.length !== 1) {
    throw new Error(`[local-package] expected one ${label}, found ${matches.length}`);
  }
  return matches[0];
};

const exactlyOneDirectory = (directory, predicate, label) => {
  const matches = fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && predicate(entry.name))
    .map((entry) => path.join(directory, entry.name));
  if (matches.length !== 1) {
    throw new Error(`[local-package] expected one ${label}, found ${matches.length}`);
  }
  return matches[0];
};

export const classifyAppleCodeSignature = (details, status = 0) => {
  const text = String(details ?? '');
  const authorities = [...text.matchAll(/^Authority=(.+)$/gmu)].map((match) => match[1].trim());
  const teamIdentifier = /^TeamIdentifier=(.+)$/mu.exec(text)?.[1]?.trim() ?? null;
  if (authorities.length > 0 || (teamIdentifier && teamIdentifier !== 'not set')) {
    return { state: 'certificate', authorities, teamIdentifier };
  }
  if (/^Signature=adhoc$/mu.test(text)) {
    return { state: 'ad-hoc', authorities: [], teamIdentifier: null };
  }
  if (status !== 0 && /not signed at all|code object is not signed/iu.test(text)) {
    return { state: 'unsigned', authorities: [], teamIdentifier: null };
  }
  return { state: status === 0 ? 'unidentified' : 'unsigned', authorities: [], teamIdentifier: null };
};

export const assertNonCertificateAppleSignature = ({ filePath, result }) => {
  const classification = classifyAppleCodeSignature(combinedOutput(result), result.status ?? 1);
  if (classification.state === 'certificate' || classification.state === 'unidentified') {
    throw new Error(
      `[local-package] ${filePath} carries a certificate-backed or unidentified Apple signature`,
    );
  }
  return classification.state;
};

const walkRegularFiles = (directory) => {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const candidate = path.join(directory, entry.name);
    const stat = fs.lstatSync(candidate);
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) files.push(...walkRegularFiles(candidate));
    else if (stat.isFile()) files.push(candidate);
  }
  return files;
};

const isMachO = (filePath) => {
  const result = run('/usr/bin/file', ['-b', filePath]);
  return result.status === 0 && /Mach-O/iu.test(String(result.stdout ?? ''));
};

export const sortCodeObjectsDeepestFirst = (files) => [...files].sort((left, right) => {
  const depth = right.split(path.sep).length - left.split(path.sep).length;
  return depth || left.localeCompare(right);
});

const resolveHdiutilOutput = (requestedPath) => {
  for (const candidate of [requestedPath, `${requestedPath}.dmg`]) {
    if (fs.lstatSync(candidate, { throwIfNoEntry: false })?.isFile()) return candidate;
  }
  throw new Error(`[local-package] hdiutil did not create ${requestedPath}`);
};

const replaceDmgApplication = ({ app, dmg }) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'zinuto-core-adhoc-dmg-'));
  const mountPath = path.join(temporary, 'mount');
  let mounted = false;
  try {
    fs.mkdirSync(mountPath);
    const writableRequested = path.join(temporary, 'template-rw.dmg');
    runRequired('/usr/bin/hdiutil', [
      'convert', dmg, '-format', 'UDRW', '-o', writableRequested,
    ], 'writable DMG conversion');
    const writableDmg = resolveHdiutilOutput(writableRequested);
    runRequired('/usr/bin/hdiutil', [
      'attach', '-readwrite', '-owners', 'on', '-noverify', '-nobrowse',
      '-mountpoint', mountPath, writableDmg,
    ], 'writable DMG mount');
    mounted = true;
    const mountedApp = exactlyOneDirectory(
      mountPath,
      (name) => name.endsWith('.app'),
      'application bundle',
    );
    fs.rmSync(mountedApp, { recursive: true, force: false });
    runRequired('/usr/bin/ditto', [app, path.join(mountPath, path.basename(app))], 'DMG app replacement');
    runRequired('/usr/bin/hdiutil', ['detach', mountPath], 'writable DMG detach');
    mounted = false;
    const rebuiltRequested = path.join(temporary, 'rebuilt.dmg');
    runRequired('/usr/bin/hdiutil', [
      'convert', writableDmg, '-format', 'UDZO', '-imagekey', 'zlib-level=9',
      '-o', rebuiltRequested,
    ], 'compressed DMG conversion');
    const rebuiltDmg = resolveHdiutilOutput(rebuiltRequested);
    runRequired('/usr/bin/hdiutil', ['verify', rebuiltDmg], 'rebuilt DMG verification');
    fs.renameSync(rebuiltDmg, dmg);
  } finally {
    if (mounted) run('/usr/bin/hdiutil', ['detach', mountPath]);
    fs.rmSync(temporary, { recursive: true, force: true });
  }
};

const normalizeMacPackageToAdHoc = ({ bundleDir }) => {
  const app = exactlyOneDirectory(
    path.join(bundleDir, 'macos'),
    (name) => name.endsWith('.app'),
    'application bundle',
  );
  const dmg = exactlyOne(path.join(bundleDir, 'dmg'), (name) => name.endsWith('.dmg'), 'DMG');
  const codeObjects = sortCodeObjectsDeepestFirst(
    walkRegularFiles(path.join(app, 'Contents')).filter(isMachO),
  );
  if (codeObjects.length < 2) {
    throw new Error('[local-package] application does not contain the expected native code closure');
  }
  for (const codeObject of codeObjects) {
    runRequired('/usr/bin/codesign', ['--force', '--sign', '-', codeObject], `ad-hoc signing ${codeObject}`);
  }
  const entitlements = path.resolve(bundleDir, '../../..', 'Entitlements.plist');
  const appSigningArgs = ['--force', '--sign', '-'];
  if (fs.lstatSync(entitlements, { throwIfNoEntry: false })?.isFile()) {
    appSigningArgs.push('--entitlements', entitlements);
  }
  appSigningArgs.push(app);
  runRequired('/usr/bin/codesign', appSigningArgs, 'ad-hoc signing application bundle');
  runRequired(
    '/usr/bin/codesign',
    ['--verify', '--deep', '--strict', '--verbose=2', app],
    'ad-hoc application verification',
  );
  replaceDmgApplication({ app, dmg });
};

export const prepareLocalPackageSignature = ({
  bundleDir = BUNDLE_DIR,
  platform = process.platform,
} = {}) => {
  if (platform === 'darwin') {
    normalizeMacPackageToAdHoc({ bundleDir });
    return { platformSignature: 'ad-hoc' };
  }
  if (platform === 'win32') return { platformSignature: 'unsigned' };
  throw new Error(`[local-package] signature preparation does not support ${platform}`);
};

const inspectMacAppClosure = (appPath) => {
  const candidates = [appPath, ...walkRegularFiles(path.join(appPath, 'Contents')).filter(isMachO)];
  const states = candidates.map((candidate) => assertNonCertificateAppleSignature({
    filePath: candidate,
    result: run('/usr/bin/codesign', ['-dv', '--verbose=4', candidate]),
  }));
  return {
    codeObjectCount: candidates.length,
    signatureStates: [...new Set(states)].sort(),
  };
};

const assertNotStapled = (filePath) => {
  const result = run('/usr/bin/xcrun', ['stapler', 'validate', filePath]);
  if (result.status === 0) {
    throw new Error(`[local-package] ${filePath} unexpectedly contains a notarization ticket`);
  }
};

const inspectMacPackage = ({ bundleDir }) => {
  const dmg = exactlyOne(path.join(bundleDir, 'dmg'), (name) => name.endsWith('.dmg'), 'DMG');
  assertNonCertificateAppleSignature({
    filePath: dmg,
    result: run('/usr/bin/codesign', ['-dv', '--verbose=4', dmg]),
  });
  assertNotStapled(dmg);

  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'zinuto-core-local-package-'));
  const mountPath = path.join(temporary, 'mount');
  let mounted = false;
  try {
    fs.mkdirSync(mountPath);
    const attach = run('/usr/bin/hdiutil', [
      'attach', '-readonly', '-nobrowse', '-noverify', '-mountpoint', mountPath, dmg,
    ]);
    if (attach.status !== 0) {
      throw new Error(`[local-package] could not mount DMG: ${combinedOutput(attach)}`);
    }
    mounted = true;
    const app = exactlyOneDirectory(mountPath, (name) => name.endsWith('.app'), 'application bundle');
    assertNotStapled(app);
    const closure = inspectMacAppClosure(app);
    return {
      platformSignature: closure.signatureStates.includes('ad-hoc') ? 'ad-hoc' : 'unsigned',
      codeObjectCount: closure.codeObjectCount,
      signatureStates: closure.signatureStates,
      companyCodeSigned: false,
      notarized: false,
    };
  } finally {
    if (mounted) run('/usr/bin/hdiutil', ['detach', mountPath]);
    fs.rmSync(temporary, { recursive: true, force: true });
  }
};

const inspectWindowsPackage = ({ bundleDir, releaseTargetDir }) => {
  const installer = exactlyOne(
    path.join(bundleDir, 'nsis'),
    (name) => name.endsWith('-setup.exe'),
    'NSIS installer',
  );
  const application = path.join(releaseTargetDir, 'open-trading-practice.exe');
  if (!fs.lstatSync(application, { throwIfNoEntry: false })?.isFile()) {
    throw new Error('[local-package] packaged Windows application is missing');
  }
  const script = [
    "$ErrorActionPreference = 'Stop'",
    '$files = @($env:ZINUTO_CORE_APPLICATION, $env:ZINUTO_CORE_INSTALLER)',
    '$results = foreach ($file in $files) {',
    '  $signature = Get-AuthenticodeSignature -LiteralPath $file',
    '  [ordered]@{ file = $file; status = [string]$signature.Status; signer = $signature.SignerCertificate.Subject }',
    '}',
    '$results | ConvertTo-Json -Compress',
  ].join('\n');
  const result = run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    env: {
      ...process.env,
      ZINUTO_CORE_APPLICATION: application,
      ZINUTO_CORE_INSTALLER: installer,
    },
  });
  if (result.status !== 0) {
    throw new Error(`[local-package] Authenticode inspection failed: ${combinedOutput(result)}`);
  }
  const signatures = JSON.parse(String(result.stdout ?? ''));
  if (
    !Array.isArray(signatures)
    || signatures.length !== 2
    || signatures.some((entry) => entry.status !== 'NotSigned' || entry.signer)
  ) {
    throw new Error('[local-package] Windows application and installer must both be Authenticode NotSigned');
  }
  return {
    platformSignature: 'unsigned',
    codeObjectCount: signatures.length,
    signatureStates: ['unsigned'],
    companyCodeSigned: false,
    notarized: false,
  };
};

export const inspectLocalPackageSignature = ({
  bundleDir = BUNDLE_DIR,
  platform = process.platform,
  releaseTargetDir = RELEASE_TARGET_DIR,
} = {}) => {
  if (platform === 'darwin') return inspectMacPackage({ bundleDir });
  if (platform === 'win32') return inspectWindowsPackage({ bundleDir, releaseTargetDir });
  throw new Error(`[local-package] signature inspection does not support ${platform}`);
};

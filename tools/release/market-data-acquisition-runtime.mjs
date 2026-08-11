// SPDX-License-Identifier: GPL-3.0-only

import fs from 'node:fs';
import path from 'node:path';

const AKSHARE_SIDECAR_TARGET_IDS = {
  'darwin:arm64': 'darwin-arm64',
  'darwin:x64': 'darwin-x64',
  'linux:arm64': 'linux-arm64',
  'linux:x64': 'linux-x64',
  'win32:arm64': 'win32-arm64',
  'win32:x64': 'win32-x64',
};

export const resolveAkshareSidecarTargetId = (
  nodePlatform = process.platform,
  nodeArch = process.arch,
) => AKSHARE_SIDECAR_TARGET_IDS[`${nodePlatform}:${nodeArch}`] ?? null;

export const resolveAkshareSidecarPackageLayout = ({
  generatedRoot,
  nodePlatform = process.platform,
  nodeArch = process.arch,
}) => {
  const targetId = resolveAkshareSidecarTargetId(nodePlatform, nodeArch);
  if (!targetId) {
    throw new Error(`Unsupported AKShare sidecar target: ${nodePlatform}-${nodeArch}`);
  }
  const acquisitionRoot = path.join(generatedRoot, 'market-data-acquisition');
  const connectorRoot = path.join(acquisitionRoot, 'akshare-sidecar');
  const bundleRoot = path.join(connectorRoot, targetId);
  const executableName = nodePlatform === 'win32'
    ? 'zinuto-akshare-sidecar.exe'
    : 'zinuto-akshare-sidecar';
  return {
    acquisitionRoot,
    bundleRoot,
    connectorRoot,
    executableName,
    executablePath: path.join(bundleRoot, executableName),
    targetId,
  };
};

const listUnexpectedEntries = (directoryPath, allowedNames) => {
  let entries;
  try {
    const metadata = fs.lstatSync(directoryPath);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) return [directoryPath];
    entries = fs.readdirSync(directoryPath, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => !allowedNames.has(entry.name))
    .map((entry) => path.join(directoryPath, entry.name));
};

export const findUnexpectedAkshareSidecarPackagePaths = ({
  generatedRoot,
  nodePlatform = process.platform,
  nodeArch = process.arch,
}) => {
  const layout = resolveAkshareSidecarPackageLayout({
    generatedRoot,
    nodePlatform,
    nodeArch,
  });
  return [
    ...listUnexpectedEntries(layout.acquisitionRoot, new Set(['akshare-sidecar'])),
    ...listUnexpectedEntries(layout.connectorRoot, new Set([layout.targetId])),
  ];
};

export const stageAkshareSidecarPackageInput = ({
  generatedRoot,
  sourceBundleRoot,
  nodePlatform = process.platform,
  nodeArch = process.arch,
}) => {
  const layout = resolveAkshareSidecarPackageLayout({
    generatedRoot,
    nodePlatform,
    nodeArch,
  });
  const sourceMetadata = fs.lstatSync(sourceBundleRoot, { throwIfNoEntry: false });
  if (!sourceMetadata?.isDirectory() || sourceMetadata.isSymbolicLink()) {
    throw new Error('AKSHARE_SIDECAR_BUILD_OUTPUT_INVALID');
  }
  const relativeSource = path.relative(layout.acquisitionRoot, sourceBundleRoot);
  if (relativeSource === '' || (!relativeSource.startsWith('..') && !path.isAbsolute(relativeSource))) {
    throw new Error('AKSHARE_SIDECAR_BUILD_OUTPUT_INSIDE_PACKAGE_ROOT');
  }

  // Tauri packages this entire generated root. Clear it before publishing so
  // stale binaries for another target can never enter the application bundle.
  fs.rmSync(layout.acquisitionRoot, { recursive: true, force: true });
  fs.mkdirSync(layout.connectorRoot, { recursive: true });
  fs.cpSync(sourceBundleRoot, layout.bundleRoot, {
    recursive: true,
    force: true,
    dereference: true,
  });
  if (!fs.lstatSync(layout.executablePath, { throwIfNoEntry: false })?.isFile()) {
    throw new Error('AKSHARE_SIDECAR_PACKAGE_INPUT_MISSING');
  }
  return layout;
};

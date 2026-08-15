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

const removeUnexpectedAcquisitionRootEntries = (acquisitionRoot) => {
  const allowedNames = new Set(['akshare-sidecar', 'finance-datareader-sidecar']);
  for (const unexpectedPath of listUnexpectedEntries(acquisitionRoot, allowedNames)) {
    fs.rmSync(unexpectedPath, { recursive: true, force: true });
  }
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
    ...listUnexpectedEntries(
      layout.acquisitionRoot,
      new Set(['akshare-sidecar', 'finance-datareader-sidecar']),
    ),
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

  // Multiple independently locked Python workers share this root. Replace
  // only AKShare's target tree so a FinanceDataReader package built in the
  // same release cannot be erased by an AKShare rebuild. Unknown generated
  // entries are not package inputs and are removed deterministically.
  removeUnexpectedAcquisitionRootEntries(layout.acquisitionRoot);
  fs.rmSync(layout.connectorRoot, { recursive: true, force: true });
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

const FINANCE_DATA_READER_SIDECAR_TARGET_IDS = AKSHARE_SIDECAR_TARGET_IDS;

export const resolveFinanceDataReaderSidecarTargetId = (
  nodePlatform = process.platform,
  nodeArch = process.arch,
) => FINANCE_DATA_READER_SIDECAR_TARGET_IDS[`${nodePlatform}:${nodeArch}`] ?? null;

export const resolveFinanceDataReaderSidecarPackageLayout = ({
  generatedRoot,
  nodePlatform = process.platform,
  nodeArch = process.arch,
}) => {
  const targetId = resolveFinanceDataReaderSidecarTargetId(nodePlatform, nodeArch);
  if (!targetId) {
    throw new Error(
      `Unsupported FinanceDataReader sidecar target: ${nodePlatform}-${nodeArch}`,
    );
  }
  const acquisitionRoot = path.join(generatedRoot, 'market-data-acquisition');
  const connectorRoot = path.join(acquisitionRoot, 'finance-datareader-sidecar');
  const bundleRoot = path.join(connectorRoot, targetId);
  const executableName = nodePlatform === 'win32'
    ? 'zinuto-finance-datareader-sidecar.exe'
    : 'zinuto-finance-datareader-sidecar';
  return {
    acquisitionRoot,
    bundleRoot,
    connectorRoot,
    executableName,
    executablePath: path.join(bundleRoot, executableName),
    targetId,
  };
};

export const findUnexpectedFinanceDataReaderSidecarPackagePaths = ({
  generatedRoot,
  nodePlatform = process.platform,
  nodeArch = process.arch,
}) => {
  const layout = resolveFinanceDataReaderSidecarPackageLayout({
    generatedRoot,
    nodePlatform,
    nodeArch,
  });
  return [
    ...listUnexpectedEntries(
      layout.acquisitionRoot,
      new Set(['akshare-sidecar', 'finance-datareader-sidecar']),
    ),
    ...listUnexpectedEntries(layout.connectorRoot, new Set([layout.targetId])),
  ];
};

export const stageFinanceDataReaderSidecarPackageInput = ({
  generatedRoot,
  sourceBundleRoot,
  nodePlatform = process.platform,
  nodeArch = process.arch,
}) => {
  const layout = resolveFinanceDataReaderSidecarPackageLayout({
    generatedRoot,
    nodePlatform,
    nodeArch,
  });
  const sourceMetadata = fs.lstatSync(sourceBundleRoot, { throwIfNoEntry: false });
  if (!sourceMetadata?.isDirectory() || sourceMetadata.isSymbolicLink()) {
    throw new Error('FINANCEDATAREADER_SIDECAR_BUILD_OUTPUT_INVALID');
  }
  const relativeSource = path.relative(layout.acquisitionRoot, sourceBundleRoot);
  if (
    relativeSource === '' ||
    (!relativeSource.startsWith('..') && !path.isAbsolute(relativeSource))
  ) {
    throw new Error('FINANCEDATAREADER_SIDECAR_BUILD_OUTPUT_INSIDE_PACKAGE_ROOT');
  }
  removeUnexpectedAcquisitionRootEntries(layout.acquisitionRoot);
  fs.rmSync(layout.connectorRoot, { recursive: true, force: true });
  fs.mkdirSync(layout.connectorRoot, { recursive: true });
  fs.cpSync(sourceBundleRoot, layout.bundleRoot, {
    recursive: true,
    force: true,
    dereference: true,
  });
  if (!fs.lstatSync(layout.executablePath, { throwIfNoEntry: false })?.isFile()) {
    throw new Error('FINANCEDATAREADER_SIDECAR_PACKAGE_INPUT_MISSING');
  }
  return layout;
};

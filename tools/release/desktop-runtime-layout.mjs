// SPDX-License-Identifier: GPL-3.0-only

const NODE_PLATFORM_TO_TARGET_PLATFORM = {
  darwin: "macos",
  win32: "windows",
};

const RUNTIME_LIBRARY_EXTENSION_BY_PLATFORM = {
  darwin: ".dylib",
  win32: ".dll",
};

const createCommonPathSet = () => ({
  backendEntryRelativePath: "backend-runtime/apps/desktop/local-api/dist/runtime/index.js",
  backendWorkingDirRelativePath: "backend-runtime",
  runtimeLibDirRelativePath: "node-runtime-libs",
});

const createPackagedPathSet = ({ nodeRuntimeEntryRelativePath, runtimeLibDirRelativePath }) => ({
  backendEntryRelativePath: "apps/desktop/local-api/dist/runtime/index.js",
  backendWorkingDirRelativePath: ".",
  nodeRuntimeEntryRelativePath,
  runtimeLibDirRelativePath,
});

export const resolveDesktopTargetPlatform = (
  nodePlatform = process.platform,
) => NODE_PLATFORM_TO_TARGET_PLATFORM[nodePlatform] || String(nodePlatform || "unknown");

export const resolveNodeRuntimeLibraryExtension = (
  nodePlatform = process.platform,
) => RUNTIME_LIBRARY_EXTENSION_BY_PLATFORM[nodePlatform] || ".so";

export const buildRuntimeManifestPathSets = (
  nodePlatform = process.platform,
) => {
  const nodeRuntimeBinaryName = nodePlatform === "win32" ? "node.exe" : "node";

  if (nodePlatform === "darwin") {
    return {
      development: {
        ...createCommonPathSet(),
        nodeRuntimeEntryRelativePath: "../runtime/node/bin/node",
      },
      packaged: createPackagedPathSet({
        nodeRuntimeEntryRelativePath: "../MacOS/zinuto-core-node",
        runtimeLibDirRelativePath: "../lib",
      }),
    };
  }

  if (nodePlatform === "win32") {
    return {
      development: {
        ...createCommonPathSet(),
        nodeRuntimeEntryRelativePath: "../runtime/node/bin/node.exe",
      },
      packaged: createPackagedPathSet({
        nodeRuntimeEntryRelativePath: "node-runtime/node.exe",
        runtimeLibDirRelativePath: "node-runtime",
      }),
    };
  }

  return {
    development: {
      ...createCommonPathSet(),
      nodeRuntimeEntryRelativePath: `../runtime/node/bin/${nodeRuntimeBinaryName}`,
    },
    packaged: createPackagedPathSet({
      nodeRuntimeEntryRelativePath: `node-runtime/${nodeRuntimeBinaryName}`,
      runtimeLibDirRelativePath: "node-runtime",
    }),
  };
};

export const createNodeRuntimeLibsMetadata = (
  nodePlatform = process.platform,
) => ({
  version: 1,
  targetPlatform: resolveDesktopTargetPlatform(nodePlatform),
  libraryExtension: resolveNodeRuntimeLibraryExtension(nodePlatform),
});

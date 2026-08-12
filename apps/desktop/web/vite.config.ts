// SPDX-License-Identifier: GPL-3.0-only

import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

type OutputChunk = {
  type: 'chunk';
  fileName: string;
  imports: string[];
  dynamicImports: string[];
  modules: Record<string, unknown>;
};

type OutputBundle = Record<
  string,
  OutputChunk | { type: 'asset'; fileName: string }
>;

const normalizePath = (value: string) => value.split(path.sep).join('/');

const frontendSrcRoot = normalizePath(path.resolve(__dirname, './src'));
const localKlinechartsRoot = normalizePath(path.resolve(__dirname, './vendor/klinecharts'));
const workspaceSharedRoot = normalizePath(path.resolve(__dirname, '../../../packages/shared'));

const vendorChunkFilePattern = /^vendor-[^/]*\.js$/;
const appRuntimeChunkFilePattern = /^app-runtime-[^/]*\.js$/;
const buildRuntimeChunkFilePattern = /^(?:preload-helper|rolldown-runtime)-[^/]*\.js$/;

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getChunkBaseName = (fileName: string) => fileName.split('/').pop() ?? fileName;

const getNodeModulePackageName = (normalizedId: string): string | undefined => {
  const marker = '/node_modules/';
  const markerIndex = normalizedId.lastIndexOf(marker);
  if (markerIndex === -1) {
    return undefined;
  }
  const modulePath = normalizedId.slice(markerIndex + marker.length);
  const [firstSegment, secondSegment] = modulePath.split('/');
  if (!firstSegment) {
    return undefined;
  }
  if (firstSegment.startsWith('@')) {
    return secondSegment ? `${firstSegment}/${secondSegment}` : undefined;
  }
  return firstSegment;
};

const isChunkFileForGroup = (fileName: string, groupName: string) =>
  new RegExp(`^${escapeRegExp(groupName)}(?:-[^/]*)?\\.js$`).test(
    getChunkBaseName(fileName),
  );

const isVendorChunkImportAllowed = (fileName: string) =>
  vendorChunkFilePattern.test(getChunkBaseName(fileName)) ||
  buildRuntimeChunkFilePattern.test(getChunkBaseName(fileName));

const getOutputChunk = (
  bundle: OutputBundle,
  fileName: string,
): OutputChunk | undefined => {
  const item = bundle[fileName];
  return item?.type === 'chunk' ? item : undefined;
};

const createDesktopBundleGraphGuard = (): Plugin => ({
  name: 'zinuto-desktop-bundle-graph-guard',
  generateBundle(_options, bundle) {
    const failures: string[] = [];
    for (const item of Object.values(bundle)) {
      if (item.type !== 'chunk') {
        continue;
      }
      if (vendorChunkFilePattern.test(getChunkBaseName(item.fileName))) {
        for (const importedFileName of [...item.imports, ...item.dynamicImports]) {
          if (!isVendorChunkImportAllowed(importedFileName)) {
            const importedChunk = getOutputChunk(bundle, importedFileName);
            const importedModules = importedChunk
              ? Object.keys(importedChunk.modules).slice(0, 6).join(', ')
              : '(missing chunk)';
            failures.push(
              `vendor chunk ${item.fileName} must not import app chunk ${importedFileName} (modules: ${importedModules}).`,
            );
          }
        }
      }

      for (const moduleId of Object.keys(item.modules)) {
        const expectedChunkName = resolveChunkName(moduleId);
        if (
          expectedChunkName?.startsWith('vendor-') &&
          !isChunkFileForGroup(item.fileName, expectedChunkName)
        ) {
          failures.push(
            `module ${moduleId} belongs to ${expectedChunkName} but was emitted in ${item.fileName}.`,
          );
        }
      }
    }

    for (const item of Object.values(bundle)) {
      if (item.type !== 'chunk') {
        continue;
      }
      for (const importedFileName of item.imports) {
        const importedChunk = getOutputChunk(bundle, importedFileName);
        if (
          importedChunk &&
          appRuntimeChunkFilePattern.test(getChunkBaseName(item.fileName)) &&
          importedChunk.imports.includes(item.fileName)
        ) {
          failures.push(
            `chunk import cycle detected between ${item.fileName} and ${importedFileName}.`,
          );
        }
      }
    }

    if (failures.length > 0) {
      this.error(`Desktop bundle graph guard failed:\n${failures.map((failure) => `- ${failure}`).join('\n')}`);
    }
  },
});

const resolveSharedChunkName = (normalizedId: string): string | undefined => {
  const sharedPrefix = `${workspaceSharedRoot}/`;
  if (!normalizedId.startsWith(sharedPrefix)) {
    return undefined;
  }
  const relativeId = normalizedId
    .slice(sharedPrefix.length)
    .replace(/^dist\//, '')
    .replace(/\.(?:mjs|js|jsx|ts|tsx)$/, '');
  const moduleName = relativeId.split('/')[0] ?? '';
  if (moduleName.startsWith('i18n.generated.')) {
    const localeChunkSuffix = moduleName
      .slice('i18n.generated.'.length)
      .replace(/[^a-z0-9]+/giu, '-')
      .toLowerCase();
    return `vendor-shared-i18n-${localeChunkSuffix}`;
  }
  if (moduleName.startsWith('i18n')) {
    return 'vendor-shared-i18n-core';
  }
  return 'vendor-shared';
};

const deferredDesktopPreloadChunkTokens = [
  'vendor-codemirror',
  'vendor-klinecharts',
  'vendor-markdown',
  'vendor-milkdown',
  'vendor-prosemirror',
  'vendor-shared-i18n-',
  'ChallengeFusionDashboard',
  'ChallengeStatsPage',
  'CustomIndicatorSystemPage',
  'DataConfigWorkspacePage',
  'DiagnosticCenterWorkspacePage',
  'HistoryReplayChart',
  'NotesPage',
  'ReplayNoteEditor',
  'SpecialTrainingPage',
  'TrainerWorkspacePage',
  'echartSurface',
  'fastDecision',
  'html2canvas',
  'jspdf',
  'specialTrainingBankUi',
  'trainingStatsViewCache',
  'useCustomIndicatorReferenceCenterController',
  'useReplayNotes',
];

const deferredSecondaryWindowPreloadChunkTokens = [
  ...deferredDesktopPreloadChunkTokens,
  'DesktopSecondaryWindowRenderers',
  'DesktopLocalDocumentDialog',
  'ReplayChart',
  'ReplayNoteEditor',
  'SpecialTrainingBankEditor',
  'AppCsvMappingModal',
  'DataConfigDetail',
  'TradingAssetSettingsPanel',
  'vendor-klinecharts',
  'vendor-shared-i18n',
  'vendor-shared',
];

const isDeferredDesktopPreload = (dep: string) => {
  const normalizedDep = dep.replaceAll('\\', '/');
  return deferredDesktopPreloadChunkTokens.some((token) =>
    normalizedDep.includes(token),
  );
};

const isDeferredSecondaryWindowPreload = (dep: string) => {
  const normalizedDep = dep.replaceAll('\\', '/');
  return deferredSecondaryWindowPreloadChunkTokens.some((token) =>
    normalizedDep.includes(token),
  );
};

const isHtmlHost = (context: { hostType: string; hostId: string }, fileName: string) =>
  context.hostType === 'html' &&
  [fileName, `/${fileName}`].some((suffix) =>
    context.hostId.replaceAll('\\', '/').endsWith(suffix),
  );

const isMainStartupPreload = (
  fileName: string,
  context: { hostType: string; hostId: string },
) => {
  if (context.hostType !== 'js') {
    return false;
  }
  const startupIdentity = `${fileName} ${context.hostId}`.replaceAll('\\', '/');
  return /(?:^|[/.-])(?:mainApp|MainAppBoot)(?:[/.-]|$)/u.test(startupIdentity);
};

const resolveChunkName = (id: string): string | undefined => {
  const normalizedId = normalizePath(id);
  if (
    normalizedId.includes('vite/preload-helper')
    || normalizedId.includes('vite/modulepreload-polyfill')
  ) {
    return 'preload-helper';
  }
  if (normalizedId.startsWith(`${localKlinechartsRoot}/`)) {
    return 'vendor-klinecharts';
  }
  if (!id.includes('node_modules')) {
    if (
      normalizedId === `${frontendSrcRoot}/ui/primitives/portalContainer.ts`
    ) {
      return 'app-portal-container';
    }
    const sharedChunkName = resolveSharedChunkName(normalizedId);
    if (sharedChunkName) {
      return sharedChunkName;
    }
    return undefined;
  }
  const packageName = getNodeModulePackageName(normalizedId);
  if (!packageName) {
    return undefined;
  }
  if (
    packageName.startsWith('@formatjs/') ||
    packageName === 'intl-messageformat'
  ) {
    return 'vendor-i18n';
  }
  if (
    packageName === 'tailwind-merge' ||
    packageName === 'clsx' ||
    packageName === 'class-variance-authority'
  ) {
    return 'vendor-ui-utils';
  }
  if (packageName.startsWith('@milkdown/')) {
    return 'vendor-milkdown';
  }
  if (packageName.startsWith('prosemirror-')) {
    return 'vendor-prosemirror';
  }
  if (packageName.startsWith('@codemirror/lang-')) {
    const lang = packageName.slice('@codemirror/lang-'.length) || 'misc';
    return `vendor-codemirror-lang-${lang}`;
  }
  if (packageName === '@codemirror/language-data') {
    return 'vendor-codemirror-lang-data';
  }
  if (
    packageName === '@codemirror/language' ||
    packageName === '@codemirror/state' ||
    packageName === '@codemirror/view' ||
    packageName === '@codemirror/search' ||
    packageName === '@codemirror/commands' ||
    packageName === '@codemirror/autocomplete' ||
    packageName === '@codemirror/highlight' ||
    packageName === 'style-mod' ||
    packageName === 'crelt' ||
    packageName === 'w3c-keyname' ||
    packageName === '@marijn/find-cluster-break'
  ) {
    return 'vendor-codemirror-core';
  }
  if (packageName.startsWith('@lezer/')) {
    const lezerPkg = packageName.slice('@lezer/'.length) || 'core';
    return `vendor-lezer-${lezerPkg}`;
  }
  if (packageName.startsWith('@uiw/')) {
    return 'vendor-codemirror-uiw';
  }
  if (packageName.startsWith('@codemirror/') || packageName === 'codemirror') {
    return 'vendor-codemirror-extra';
  }
  if (packageName === 'klinecharts') {
    return 'vendor-klinecharts';
  }
  if (
    packageName === 'katex' ||
    packageName === 'markdown-it' ||
    packageName === 'highlight.js'
  ) {
    return 'vendor-markdown';
  }
  if (
    packageName === 'react' ||
    packageName === 'react-dom' ||
    packageName === 'scheduler'
  ) {
    return 'vendor-react';
  }
  if (packageName === 'lucide-react') {
    return 'vendor-icons';
  }
  if (
    packageName === 'zod' ||
    packageName === '@js-temporal/polyfill' ||
    packageName === 'jsbi'
  ) {
    return 'vendor-shared-runtime';
  }
  return undefined;
};

export default defineConfig(({ mode }) => ({
  plugins: [
    react({ include: /\.[jt]sx$/ }),
    createDesktopBundleGraphGuard(),
  ],
  resolve: {
    // Prefer TypeScript source modules over stale JS shadow files when imports omit extensions.
    extensions: ['.mjs', '.mts', '.ts', '.jsx', '.tsx', '.js', '.json'],
    alias: {
      '@': path.resolve(__dirname, './src'),
      klinecharts: path.resolve(__dirname, './vendor/klinecharts/index.esm.js'),
    }
  },
  optimizeDeps: {
    // Keep the vendored klinecharts build out of Vite pre-bundle cache.
    exclude: ['klinecharts']
  },
  build: {
    // The explicit bundle gate enforces this limit for every emitted JS chunk.
    chunkSizeWarningLimit: 750,
    sourcemap: false,
    modulePreload: {
      resolveDependencies(_filename, deps, context) {
        if (isHtmlHost(context, 'secondary-window.html')) {
          return deps.filter((dep) => !isDeferredSecondaryWindowPreload(dep));
        }
        if (isHtmlHost(context, 'index.html')) {
          return deps.filter((dep) => !isDeferredDesktopPreload(dep));
        }
        if (isMainStartupPreload(_filename, context)) {
          return deps.filter((dep) => !isDeferredDesktopPreload(dep));
        }
        return deps;
      },
    },
    rollupOptions: {
      preserveEntrySignatures: 'allow-extension',
      input: {
        main: path.resolve(__dirname, 'index.html'),
        'secondary-window': path.resolve(__dirname, 'secondary-window.html'),
        ...(mode === 'test-harness' ? {
          'i18n-pages': path.resolve(__dirname, 'i18n-pages.html'),
          'i18n-harness': path.resolve(__dirname, 'i18n-harness.html'),
          'workspace-navigation-continuity': path.resolve(__dirname, 'workspace-navigation-continuity.html'),
          'ui-catalog': path.resolve(__dirname, 'ui-catalog.html'),
        } : {}),
      },
      output: {
        strictExecutionOrder: true,
        codeSplitting: {
          includeDependenciesRecursively: false,
          minSize: 20_000,
          maxSize: 700_000,
          groups: [
            {
              name: 'preload-helper',
              test: (moduleId) => resolveChunkName(moduleId) === 'preload-helper',
              priority: 2,
              minSize: 0,
              maxSize: 700_000,
            },
            {
              name: 'vendor-codemirror-extra',
              test: (moduleId) =>
                resolveChunkName(moduleId) === 'vendor-codemirror-extra',
              priority: 1,
              minSize: 0,
              maxSize: 700_000,
            },
            {
              name: resolveChunkName,
              minSize: 20_000,
              maxSize: 700_000,
            },
          ],
        },
      }
    }
  },
  server: {
    port: 5173
  }
}));

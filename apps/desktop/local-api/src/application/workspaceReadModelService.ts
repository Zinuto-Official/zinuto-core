// SPDX-License-Identifier: GPL-3.0-only

/**
 * Barrel file — re-exports the workspace read model API from workspaceReadModel/.
 * Split from the original monolith for maintainability.
 */
export {
  WORKSPACE_READ_MODEL_IDS,
  WORKSPACE_READ_MODEL_REGISTRY,
  isDesktopWorkspaceReadModelId,
  buildWorkspaceReadModel,
  type WorkspaceReadModelBuildOptions,
  type WorkspaceReadModelDependencies,
  type WorkspaceReadModelRegistryEntry,
} from './workspaceReadModel/index.js';

// SPDX-License-Identifier: GPL-3.0-only

import os from "node:os";
import path from "node:path";

export const COMMUNITY_DESKTOP_BUNDLE_ID = "org.zinuto.core";

type ResolveDesktopRuntimePathOptions = {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  homeDir?: string;
};

const normalizeText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const resolveConfiguredHomeDir = (
  env: NodeJS.ProcessEnv = process.env,
  explicitHomeDir?: string,
): string =>
  normalizeText(explicitHomeDir) ||
  normalizeText(env.HOME) ||
  normalizeText(env.USERPROFILE);

export const isMacOSPlatform = (
  platform: NodeJS.Platform = process.platform,
): boolean => platform === "darwin";

export const isWindowsPlatform = (
  platform: NodeJS.Platform = process.platform,
): boolean => platform === "win32";

export const resolveDesktopBundleIdentifier = (
): string => COMMUNITY_DESKTOP_BUNDLE_ID;

export const resolveDesktopHomeDir = ({
  env = process.env,
  homeDir,
}: ResolveDesktopRuntimePathOptions = {}): string => {
  const configuredHomeDir = resolveConfiguredHomeDir(env, homeDir);
  return configuredHomeDir ? path.resolve(configuredHomeDir) : os.homedir();
};

const resolveMacOSContainerHomeSuffix = (bundleIdentifier: string): string =>
  path.join("Library", "Containers", bundleIdentifier, "Data");

const resolveMacOSAppDataSuffix = (bundleIdentifier: string): string =>
  path.join("Library", "Application Support", bundleIdentifier);

const trimTrailingSeparator = (value: string): string => {
  const normalized = value.replace(/[\\/]+$/u, "");
  return normalized || path.parse(value).root || value;
};

export const resolveDesktopUserHomeDir = ({
  env = process.env,
  platform = process.platform,
  homeDir,
}: ResolveDesktopRuntimePathOptions = {}): string => {
  const resolvedHomeDir = resolveDesktopHomeDir({ env, homeDir });
  if (!isMacOSPlatform(platform)) {
    return resolvedHomeDir;
  }

  const containerHomeSuffix = resolveMacOSContainerHomeSuffix(
    resolveDesktopBundleIdentifier(),
  );
  const containerSuffixToken = `${path.sep}${containerHomeSuffix}`;
  if (!resolvedHomeDir.endsWith(containerSuffixToken)) {
    return resolvedHomeDir;
  }

  return trimTrailingSeparator(
    resolvedHomeDir.slice(0, -containerSuffixToken.length),
  );
};

export const resolveDesktopAppDataDir = ({
  env = process.env,
  platform = process.platform,
  homeDir,
}: ResolveDesktopRuntimePathOptions = {}): string => {
  const resolvedHomeDir = resolveDesktopHomeDir({ env, homeDir });
  const bundleIdentifier = resolveDesktopBundleIdentifier();

  if (isMacOSPlatform(platform)) {
    const containerHomeSuffix = resolveMacOSContainerHomeSuffix(bundleIdentifier);
    const appDataSuffix = resolveMacOSAppDataSuffix(bundleIdentifier);
    const containerSuffixToken = `${path.sep}${containerHomeSuffix}`;
    if (resolvedHomeDir.endsWith(containerSuffixToken)) {
      return path.join(resolvedHomeDir, appDataSuffix);
    }
    const userHomeDir = resolveDesktopUserHomeDir({ env, platform, homeDir });
    return path.join(userHomeDir, containerHomeSuffix, appDataSuffix);
  }

  const userHomeDir = resolveDesktopUserHomeDir({ env, platform, homeDir });
  if (isWindowsPlatform(platform)) {
    const localAppData =
      normalizeText(env.LOCALAPPDATA) ||
      path.join(userHomeDir, "AppData", "Local");
    return path.join(localAppData, bundleIdentifier);
  }

  const xdgDataHome =
    normalizeText(env.XDG_DATA_HOME) ||
    path.join(userHomeDir, ".local", "share");
  return path.join(xdgDataHome, bundleIdentifier);
};

export const resolveDesktopBackendTransportType = (
  platform: NodeJS.Platform = process.platform,
): "unix" | "tcp" | null => {
  if (isMacOSPlatform(platform)) {
    return "unix";
  }
  if (isWindowsPlatform(platform)) {
    return "tcp";
  }
  return null;
};

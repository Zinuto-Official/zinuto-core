// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, useState } from "react";
import {
  api,
  type ApiSystemStartupStatus,
  type ApiSystemStorageUsage,
} from "@/api";
import { Button } from "@/ui/primitives/button";
import { useI18n } from "@/frontend-kernel/i18n";
import { SettingRow, WorkspaceSection } from "@/ui/components";
import { tt } from "@/frontend-kernel/i18n/messageRuntime";
import { VendorIcon } from "@/assets/graphics";
import {
  DesktopLocalDocumentDialog,
} from "@/domains/local-content/DesktopLocalDocumentDialog";
import {
  type DesktopLocalDocumentId,
} from "@/domains/local-content/desktopLocalDocuments";

type StorageLayoutSummaryProps = {
  formatStorageBytes: (value: number) => string;
  isSystemStorageUsageLoading: boolean;
};

type SystemSettingsDesktopStatusSectionProps = {
  canRestartOnboarding?: boolean;
  onRestartOnboarding?: () => void;
};

const INLINE_SEPARATOR = String.fromCharCode(183);
const EMPTY_VALUE_TEXT = String.fromCharCode(45, 45);

const joinInlineStatusSegments = (...segments: Array<string | null | undefined>): string =>
  segments
    .map((segment) => String(segment ?? "").trim())
    .filter(Boolean)
    .join(` ${INLINE_SEPARATOR} `);

export const SystemSettingsDesktopStatusSection = ({
  canRestartOnboarding = false,
  onRestartOnboarding,
}: SystemSettingsDesktopStatusSectionProps) => {
  const { locale } = useI18n();
  const [desktopAppVersion, setDesktopAppVersion] = useState<string | null>(null);
  const [activeLocalDocumentId, setActiveLocalDocumentId] =
    useState<DesktopLocalDocumentId | null>(null);

  const refreshDesktopStatus = useCallback(async () => {
    const nextVersion = await api.getDesktopAppVersion().catch(() => null);
    setDesktopAppVersion(nextVersion);
  }, []);

  useEffect(() => {
    void refreshDesktopStatus();
  }, [refreshDesktopStatus]);

  const currentVersion = desktopAppVersion?.trim() || null;

  return (
    <WorkspaceSection
      title={tt("settings.about.title")}
      subtitle={tt("settings.about.description")}
      className="settings-flow-group"
      bodyClassName="settings-flow-row-list settings-desktop-release-section"
    >
      <div className="settings-semantic-group settings-desktop-release-status-group">
        <SettingRow
          title={tt("appText.version")}
          control={currentVersion || EMPTY_VALUE_TEXT}
        />
      </div>

      <div
        className="settings-semantic-group settings-secondary-action-group settings-desktop-release-links"
        aria-label={tt("settings.about.title")}
      >
        <div aria-hidden="true"></div>
        <div className="settings-inline-action-row settings-desktop-release-actions">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => {
              setActiveLocalDocumentId("releaseNotes");
            }}
          >
            {tt("appText.releaseNotes")}
          </Button>
          {canRestartOnboarding && onRestartOnboarding ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={onRestartOnboarding}
            >
              <VendorIcon name="rotateCcw" aria-hidden="true" />
              <span>{tt("onboarding.desktop.restart")}</span>
            </Button>
          ) : null}
        </div>
      </div>

      <DesktopLocalDocumentDialog
        currentVersion={currentVersion}
        documentId={activeLocalDocumentId}
        language={locale}
        open={activeLocalDocumentId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setActiveLocalDocumentId(null);
          }
        }}
      />
    </WorkspaceSection>
  );
};

export const SystemSettingsStorageLayoutSummary = ({
  formatStorageBytes,
  isSystemStorageUsageLoading,
}: StorageLayoutSummaryProps) => {
  const [startupStatus, setStartupStatus] =
    useState<ApiSystemStartupStatus | null>(null);
  const [storageLayoutUsage, setStorageLayoutUsage] =
    useState<ApiSystemStorageUsage["storageLayout"] | null>(null);

  const refreshStorageLayout = useCallback(async () => {
    const [nextStartupStatus, latestUsage] = await Promise.all([
      api.getSystemStartupStatus().catch(() => null),
      api.getSystemStorageUsage().catch(() => null),
    ]);
    setStartupStatus(nextStartupStatus);
    setStorageLayoutUsage(latestUsage?.storageLayout ?? null);
  }, []);

  useEffect(() => {
    if (isSystemStorageUsageLoading) {
      return;
    }
    void refreshStorageLayout();
  }, [isSystemStorageUsageLoading, refreshStorageLayout]);

  if (!storageLayoutUsage) {
    return null;
  }

  return (
    <>
      <div className="settings-storage-summary-line">
        <div className="settings-storage-total-wrap">
          <span className="settings-storage-total">
            {tt("appText.storageLayout")}
          </span>
        </div>
        <div className="settings-storage-grid">
          {[
            {
              key: "core",
              label: tt("appText.coreStore"),
              bytes: storageLayoutUsage.coreBytes,
            },
            {
              key: "market",
              label: tt("appText.marketStore"),
              bytes: storageLayoutUsage.marketBytes,
            },
            {
              key: "cache",
              label: tt("appText.cache"),
              bytes: storageLayoutUsage.cacheBytes,
            },
            {
              key: "temp",
              label: tt("appText.temp"),
              bytes: storageLayoutUsage.tempBytes,
            },
          ].map((item) => (
            <div
              key={item.key}
              className="settings-storage-item"
              title={`${item.label} ${formatStorageBytes(item.bytes)}`}
            >
              <span className="settings-storage-item-label">{item.label}</span>
              <span className="settings-storage-item-value">
                {formatStorageBytes(item.bytes)}
              </span>
            </div>
          ))}
        </div>
      </div>
      {startupStatus?.storageLayout ? (
        <div className="settings-storage-note">
          {joinInlineStatusSegments(
            tt("appText.pathMigration"),
            startupStatus.storageLayout.coreDataDir,
          )}
        </div>
      ) : null}
    </>
  );
};

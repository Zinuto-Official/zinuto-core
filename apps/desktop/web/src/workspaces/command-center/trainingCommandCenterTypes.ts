// SPDX-License-Identifier: GPL-3.0-only

import type { AppIconName } from "@/assets/graphics";
import type { ReplayNoteColorToken } from "@zinuto/shared/replayNoteColors";

export type TrainingCommandCenterHeroCardView = {
  id: "strategy" | "flash" | "crisis";
  title: string;
  summary: string;
  iconName: AppIconName;
  metricLabel: string;
  metricValue: string;
  metricSupport?: string;
  metricItems?: Array<{ id: string; value: string; label: string }>;
  primaryAction: {
    label: string;
    onClick: () => void;
    tone: "primary" | "tonal";
    disabled?: boolean;
    iconName?: AppIconName;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    iconName?: AppIconName;
  };
};

export type TrainingCommandCenterRecentActivityView = {
  id: string;
  title: string;
  typeLabel?: string;
  colorTokens?: ReplayNoteColorToken[];
  timeLabel: string;
  onOpen: () => void;
};

export type TrainingCommandCenterPageProps = {
  eyebrow: string;
  title: string;
  heroSection: {
    title: string;
    subtitle: string;
    cards: TrainingCommandCenterHeroCardView[];
  };
  utilitySection: {
    title: string;
    subtitle: string;
    dataCenter: {
      title: string;
      subtitle: string;
      summaryLabel: string;
      actionLabel: string;
      summary: string;
      summaryItems?: Array<{ id: string; value: string; label: string }>;
      onOpen: () => void;
    };
    recentActivities: {
      title: string;
      moreActionLabel: string;
      onOpenMore: () => void;
      emptyText: string;
      emptyHintText: string;
      items: TrainingCommandCenterRecentActivityView[];
    };
  };
};

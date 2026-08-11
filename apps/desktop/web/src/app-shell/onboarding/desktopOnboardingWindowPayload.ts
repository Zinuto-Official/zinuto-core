// SPDX-License-Identifier: GPL-3.0-only

import type {
  DesktopOnboardingTargetId,
  DesktopOnboardingTourStep,
} from "@/domains/onboarding/desktopOnboardingModel";
import type { VendorIconName } from "@/assets/graphics";

export type DesktopOnboardingCardTone = "primary" | "secondary" | "accent";

export type DesktopOnboardingWindowRow = {
  targetId: DesktopOnboardingTargetId;
  eyebrow: string;
  title: string;
  body: string;
  tone?: DesktopOnboardingCardTone;
};

export type DesktopOnboardingWindowPayload = {
  step: DesktopOnboardingTourStep;
  title: string;
  body: string;
  setupLabel: string;
  progressLabel: string;
  deferLabel: string;
  skipLabel: string;
  backLabel: string;
  completeSetupLabel: string;
  primaryLabel: string;
  primaryIcon?: VendorIconName;
  isFinalStep: boolean;
  canGoBack: boolean;
  rows: DesktopOnboardingWindowRow[];
  selectedTargetId: DesktopOnboardingTargetId | null;
};

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export const isDesktopOnboardingWindowPayload = (
  value: unknown,
): value is DesktopOnboardingWindowPayload => {
  if (!isObjectRecord(value)) {
    return false;
  }
  return (
    typeof value.step === "string" &&
    typeof value.title === "string" &&
    typeof value.body === "string" &&
    typeof value.setupLabel === "string" &&
    typeof value.progressLabel === "string" &&
    typeof value.deferLabel === "string" &&
    typeof value.skipLabel === "string" &&
    typeof value.backLabel === "string" &&
    typeof value.completeSetupLabel === "string" &&
    typeof value.primaryLabel === "string" &&
    typeof value.isFinalStep === "boolean" &&
    typeof value.canGoBack === "boolean" &&
    Array.isArray(value.rows)
  );
};

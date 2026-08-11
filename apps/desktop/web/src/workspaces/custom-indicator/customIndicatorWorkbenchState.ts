// SPDX-License-Identifier: GPL-3.0-only

import {
  buildSystemDefaultIndicatorOverrideProfileId,
  parseSystemDefaultIndicatorOverrideTemplateId,
  readSavedIndicatorProfiles,
  type SavedIndicatorProfile,
} from "@/domains/custom-indicator/indicator/profileStore";
import type {
  EffectiveSystemIndicatorTemplate,
  IndicatorGroupKey,
  ManagerGroupKey,
} from "@/workspaces/custom-indicator/customIndicatorWorkbenchTypes";
import type {
  readCustomIndicatorSystemDefaults,
} from "@/workspaces/custom-indicator/customIndicatorWorkspaceReadModelUi";
import { useCallback, useMemo, useState } from "react";

type SystemDefaults = ReturnType<typeof readCustomIndicatorSystemDefaults>;

type CustomIndicatorWorkbenchStateArgs = {
  customIndicatorSystemDefaults: SystemDefaults;
};

const DEFAULT_INDICATOR_GROUP: IndicatorGroupKey = "system";
export const useCustomIndicatorWorkbenchState = ({
  customIndicatorSystemDefaults,
}: CustomIndicatorWorkbenchStateArgs) => {
  const [savedProfiles, setSavedProfiles] = useState<SavedIndicatorProfile[]>(
    () => readSavedIndicatorProfiles(),
  );
  const [activeIndicatorGroup, setActiveIndicatorGroup] =
    useState<IndicatorGroupKey>(DEFAULT_INDICATOR_GROUP);
  const [activeSystemTemplateId, setActiveSystemTemplateId] = useState<string>(
    () => customIndicatorSystemDefaults.templates[0]?.id ?? "",
  );
  const [activeSavedProfileId, setActiveSavedProfileId] = useState<
    string | null
  >(null);
  const [collapsedManagerGroups, setCollapsedManagerGroups] = useState<
    ManagerGroupKey[]
  >(["custom"]);

  const userSavedProfiles = useMemo(
    () =>
      savedProfiles.filter(
        (profile) => !parseSystemDefaultIndicatorOverrideTemplateId(profile.id),
      ),
    [savedProfiles],
  );
  const systemOverrideProfileByTemplateId = useMemo(() => {
    const mapping = new Map<string, SavedIndicatorProfile>();
    savedProfiles.forEach((profile) => {
      const templateId = parseSystemDefaultIndicatorOverrideTemplateId(profile.id);
      if (templateId) {
        mapping.set(templateId, profile);
      }
    });
    return mapping;
  }, [savedProfiles]);
  const effectiveSystemTemplates = useMemo<EffectiveSystemIndicatorTemplate[]>(
    () =>
      customIndicatorSystemDefaults.templates.map((template) => ({
        ...template,
        overrideProfile: systemOverrideProfileByTemplateId.get(template.id) ?? null,
      })),
    [customIndicatorSystemDefaults.templates, systemOverrideProfileByTemplateId],
  );
  const activeSavedProfile = useMemo(
    () =>
      userSavedProfiles.find((item) => item.id === activeSavedProfileId) ?? null,
    [activeSavedProfileId, userSavedProfiles],
  );
  const activeSystemTemplate = useMemo(
    () =>
      effectiveSystemTemplates.find(
        (template) => template.id === activeSystemTemplateId,
      ) ?? null,
    [activeSystemTemplateId, effectiveSystemTemplates],
  );
  const starterSystemTemplate = useMemo(
    () => effectiveSystemTemplates[0] ?? null,
    [effectiveSystemTemplates],
  );

  const toggleManagerGroup = useCallback((group: ManagerGroupKey) => {
    setCollapsedManagerGroups((current) =>
      current.includes(group)
        ? current.filter((item) => item !== group)
        : [...current, group],
    );
  }, []);
  const expandManagerGroup = useCallback((group: ManagerGroupKey) => {
    setCollapsedManagerGroups((current) =>
      current.includes(group)
        ? current.filter((item) => item !== group)
        : current,
    );
  }, []);

  return {
    savedProfiles,
    setSavedProfiles,
    activeIndicatorGroup,
    setActiveIndicatorGroup,
    activeSystemTemplateId,
    setActiveSystemTemplateId,
    activeSavedProfileId,
    setActiveSavedProfileId,
    collapsedManagerGroups,
    toggleManagerGroup,
    expandManagerGroup,
    effectiveSystemTemplates,
    userSavedProfiles,
    activeSavedProfile,
    activeSystemTemplate,
    starterSystemTemplate,
    buildSystemDefaultIndicatorOverrideProfileId,
  };
};

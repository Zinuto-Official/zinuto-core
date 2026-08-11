// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useState } from 'react';
import {
  hydrateSavedIndicatorProfilesFromDatabase,
  readSavedIndicatorProfilesVersionToken,
  subscribeSavedIndicatorProfilesChange
} from '@/domains/custom-indicator/indicator/profileStore';
import {
  readCustomIndicatorRuntimeRegistryVersionToken,
  subscribeCustomIndicatorRuntimeRegistryChange,
  syncSavedCustomProfileIndicators,
} from '@/domains/indicators/customProfileRegistry';

export const useCustomIndicatorProfileVersionState = () => {
  const [customIndicatorProfileVersionToken, setCustomIndicatorProfileVersionToken] = useState<string>(() =>
    [
      readSavedIndicatorProfilesVersionToken(),
      readCustomIndicatorRuntimeRegistryVersionToken(),
    ].join('|')
  );

  useEffect(() => {
    void hydrateSavedIndicatorProfilesFromDatabase().catch(() => undefined);
  }, []);

  useEffect(() => {
    const publish = () => {
      const nextToken = [
        readSavedIndicatorProfilesVersionToken(),
        readCustomIndicatorRuntimeRegistryVersionToken(),
      ].join('|');
      setCustomIndicatorProfileVersionToken((current) => {
        if (current === nextToken) {
          return current;
        }
        return nextToken || `${Date.now()}`;
      });
    };
    const syncProfiles = () => {
      syncSavedCustomProfileIndicators();
      publish();
    };
    const unsubscribeProfiles = subscribeSavedIndicatorProfilesChange(syncProfiles);
    const unsubscribeRuntimeRegistry =
      subscribeCustomIndicatorRuntimeRegistryChange(publish);
    syncProfiles();
    return () => {
      unsubscribeProfiles();
      unsubscribeRuntimeRegistry();
    };
  }, []);

  return {
    customIndicatorProfileVersionToken
  };
};

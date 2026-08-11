// SPDX-License-Identifier: GPL-3.0-only

import type { UiLanguage } from "@/frontend-kernel/typography";
import { useEffect, useMemo, useState } from 'react';
import {
  buildGroupedSignalIndicatorSelectOptions,
  buildMainIndicatorSelectOptions,
  buildSupportedIndicatorNameSet,
  loadNativeSignalIndicatorNames
} from '@/domains/indicators/catalog';
import { INDICATOR_NONE_LABEL_BY_LANGUAGE } from '@/ui/config/uiConfig';

type UseTrainerIndicatorOptionsModelArgs = {
  language: UiLanguage;
  chartReady: boolean;
  customIndicatorProfileVersionToken: string;
  indicatorGroupSystemDefaultLabel: string;
  indicatorGroupCustomLabel: string;
};

export const useTrainerIndicatorOptionsModel = ({
  language,
  chartReady,
  customIndicatorProfileVersionToken,
  indicatorGroupSystemDefaultLabel,
  indicatorGroupCustomLabel
}: UseTrainerIndicatorOptionsModelArgs) => {
  const [nativeSignalIndicatorNames, setNativeSignalIndicatorNames] = useState<string[] | null>(null);

  useEffect(() => {
    if (!chartReady) {
      return;
    }

    let disposed = false;
    void loadNativeSignalIndicatorNames()
      .then((names) => {
        if (!disposed) {
          setNativeSignalIndicatorNames(names);
        }
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
    };
  }, [chartReady]);

  const groupedSignalIndicatorSelectOptions = useMemo(
    () =>
      buildGroupedSignalIndicatorSelectOptions(
        INDICATOR_NONE_LABEL_BY_LANGUAGE[language],
        indicatorGroupSystemDefaultLabel,
        indicatorGroupCustomLabel,
        nativeSignalIndicatorNames
      ),
    [
      chartReady,
      customIndicatorProfileVersionToken,
      indicatorGroupCustomLabel,
      indicatorGroupSystemDefaultLabel,
      language,
      nativeSignalIndicatorNames
    ]
  );
  const indicatorSelectOptions = useMemo(
    () => groupedSignalIndicatorSelectOptions.flatOptions,
    [groupedSignalIndicatorSelectOptions]
  );
  const mainIndicatorSelectOptions = useMemo(
    () => buildMainIndicatorSelectOptions(INDICATOR_NONE_LABEL_BY_LANGUAGE[language]),
    [language]
  );
  const supportedIndicatorNameSet = useMemo(() => {
    const signalSet = buildSupportedIndicatorNameSet(indicatorSelectOptions);
    const mainSet = buildSupportedIndicatorNameSet(mainIndicatorSelectOptions);
    return new Set([...signalSet, ...mainSet]);
  }, [indicatorSelectOptions, mainIndicatorSelectOptions]);
  return {
    mainIndicatorSelectOptions,
    groupedSignalIndicatorSelectOptions,
    indicatorSelectOptions,
    supportedIndicatorNameSet
  };
};

// SPDX-License-Identifier: GPL-3.0-only

import { useState } from 'react';
import type { UiSettings } from '@/frontend-kernel/appTypes';
import { DEFAULT_AUTOPLAY_BARS_PER_SEC } from '@/domains/trainer/autoplayRate';

type UseTrainerAutoplayStateArgs = {
  persistedUi: UiSettings;
};

export const useTrainerAutoplayState = ({ persistedUi }: UseTrainerAutoplayStateArgs) => {
  const [autoplayBarsPerSec, setAutoplayBarsPerSec] = useState(() => {
    if (typeof persistedUi.autoplayBarsPerSec === 'string') {
      return persistedUi.autoplayBarsPerSec;
    }
    return DEFAULT_AUTOPLAY_BARS_PER_SEC;
  });
  const [isAutoplay, setIsAutoplay] = useState(false);

  return {
    autoplayBarsPerSec,
    setAutoplayBarsPerSec,
    isAutoplay,
    setIsAutoplay
  };
};

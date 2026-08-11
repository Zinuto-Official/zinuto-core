// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, type Dispatch, type SetStateAction } from 'react';

type OptionLike = {
  key: string;
};

type UseIndicatorSelectionGuardsArgs = {
  noneValue: string;
  mainNativeIndicator: string;
  mainIndicatorSelectOptions: OptionLike[];
  setMainNativeIndicator: Dispatch<SetStateAction<string>>;
  setMainNativeIndicatorParams: Dispatch<SetStateAction<number[]>>;
  signalTopIndicator: string;
  setSignalTopIndicator: Dispatch<SetStateAction<string>>;
  setSignalTopIndicatorParams: Dispatch<SetStateAction<number[]>>;
  signalBottomIndicator: string;
  setSignalBottomIndicator: Dispatch<SetStateAction<string>>;
  setSignalBottomIndicatorParams: Dispatch<SetStateAction<number[]>>;
  supportedIndicatorNameSet: Set<string>;
};

export const useIndicatorSelectionGuards = ({
  noneValue,
  mainNativeIndicator,
  mainIndicatorSelectOptions,
  setMainNativeIndicator,
  setMainNativeIndicatorParams,
  signalTopIndicator,
  setSignalTopIndicator,
  setSignalTopIndicatorParams,
  signalBottomIndicator,
  setSignalBottomIndicator,
  setSignalBottomIndicatorParams,
  supportedIndicatorNameSet
}: UseIndicatorSelectionGuardsArgs) => {
  useEffect(() => {
    if (mainNativeIndicator === noneValue) {
      return;
    }
    const allowed = new Set<string>(mainIndicatorSelectOptions.map((option) => option.key));
    if (!allowed.has(mainNativeIndicator)) {
      setMainNativeIndicator(noneValue);
      setMainNativeIndicatorParams([]);
    }
  }, [mainIndicatorSelectOptions, mainNativeIndicator, noneValue, setMainNativeIndicator, setMainNativeIndicatorParams]);

  useEffect(() => {
    if (signalTopIndicator === noneValue) {
      return;
    }
    if (!supportedIndicatorNameSet.has(signalTopIndicator)) {
      setSignalTopIndicator(noneValue);
      setSignalTopIndicatorParams([]);
    }
  }, [noneValue, setSignalTopIndicator, setSignalTopIndicatorParams, signalTopIndicator, supportedIndicatorNameSet]);

  useEffect(() => {
    if (signalBottomIndicator === noneValue) {
      return;
    }
    if (!supportedIndicatorNameSet.has(signalBottomIndicator)) {
      setSignalBottomIndicator(noneValue);
      setSignalBottomIndicatorParams([]);
    }
  }, [noneValue, setSignalBottomIndicator, setSignalBottomIndicatorParams, signalBottomIndicator, supportedIndicatorNameSet]);
};

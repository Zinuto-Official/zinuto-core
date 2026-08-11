// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, type Dispatch, type SetStateAction } from 'react';

type UseShortcutModalEscapeArgs = {
  showShortcutModal: boolean;
  setShowShortcutModal: Dispatch<SetStateAction<boolean>>;
};

export const useShortcutModalEscape = ({
  showShortcutModal,
  setShowShortcutModal
}: UseShortcutModalEscapeArgs) => {
  useEffect(() => {
    if (!showShortcutModal) {
      return undefined;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowShortcutModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [setShowShortcutModal, showShortcutModal]);
};

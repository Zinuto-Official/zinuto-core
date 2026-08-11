// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useRef, useState } from "react";
import type { ApiSpecialTrainingScopeRestartSignal } from "@/api";
import { SCOPE_RESTART_NOTICE_AUTO_CLOSE_SECONDS } from "@/workspaces/special-training/domain/specialTrainingConstants";

export const useScopeRestartNoticeCountdown = ({
  notice,
  onClose,
}: {
  notice: ApiSpecialTrainingScopeRestartSignal | null;
  onClose: () => void;
}) => {
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef<number | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (!notice) {
      setCountdown(0);
      return;
    }

    setCountdown(SCOPE_RESTART_NOTICE_AUTO_CLOSE_SECONDS);
    const endsAtMs =
      Date.now() + SCOPE_RESTART_NOTICE_AUTO_CLOSE_SECONDS * 1000;
    timerRef.current = window.setInterval(() => {
      const remain = Math.max(
        0,
        Math.ceil((endsAtMs - Date.now()) / 1000),
      );
      setCountdown(remain);
      if (remain <= 0) {
        if (timerRef.current !== null) {
          window.clearInterval(timerRef.current);
          timerRef.current = null;
        }
        onCloseRef.current();
      }
    }, 1000);

    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [notice]);

  return countdown;
};

// SPDX-License-Identifier: GPL-3.0-only

import { useChartNoteHover } from "@/frontend-kernel/chartNoteHoverStore";

export const ChartNoteHoverTooltip = () => {
  const hover = useChartNoteHover();
  if (!hover) {
    return null;
  }
  return (
    <div
      className="chart-note-hover-tooltip"
      style={{
        left: `${hover.pageX + 10}px`,
        top: `${hover.pageY + 10}px`,
      }}
    >
      {hover.title}
    </div>
  );
};

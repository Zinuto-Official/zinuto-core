// SPDX-License-Identifier: GPL-3.0-only

import { useMemo } from "react";

type BacktestEquitySparklinePoint = {
  equity: number;
};

type BacktestEquitySparklineGraphicProps = {
  className?: string;
  points: readonly BacktestEquitySparklinePoint[];
};

const formatSvgCoordinate = (value: number): string =>
  Number(value.toFixed(2)).toString();

const buildEquitySparklinePath = (
  points: readonly BacktestEquitySparklinePoint[],
): string => {
  if (points.length < 2) {
    return "";
  }
  const values = points.map((point) => Number(point.equity));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1e-8, max - min);
  return points
    .map((point, index) => {
      const x = points.length <= 1 ? 0 : (index / (points.length - 1)) * 100;
      const y = 36 - ((Number(point.equity) - min) / span) * 32 - 2;
      return `${index === 0 ? "M" : "L"}${formatSvgCoordinate(x)},${formatSvgCoordinate(y)}`;
    })
    .join(" ");
};

export const BacktestEquitySparklineGraphic = ({
  className = "strategy-backtest-sparkline",
  points,
}: BacktestEquitySparklineGraphicProps) => {
  const path = useMemo(() => buildEquitySparklinePath(points), [points]);

  return (
    <svg
      className={className}
      viewBox="0 0 100 40"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {path ? <path d={path} /> : null}
    </svg>
  );
};

// SPDX-License-Identifier: GPL-3.0-only

import type { RefObject } from 'react';
import type { CanvasCurvePoint, CanvasGeometry } from '@/assets/graphics/curveSparklineGeometry';

type CurveSparklineGraphicProps = {
  activePoint: CanvasCurvePoint | null;
  areaPath: string;
  baselineColor: string;
  className?: string;
  containerRef: RefObject<HTMLDivElement | null>;
  crosshairColor: string;
  fillColor: string;
  geometry: CanvasGeometry;
  gradientId: string;
  gridColor: string;
  lineColor: string;
  linePath: string;
  onPointerLeave: () => void;
  onPointerMove: (clientX: number) => void;
  transparentColor: string;
};

const formatSvgCoordinate = (value: number): string =>
  Number(value.toFixed(2)).toString();

export const CurveSparklineGraphic = ({
  activePoint,
  areaPath,
  baselineColor,
  className,
  containerRef,
  crosshairColor,
  fillColor,
  geometry,
  gradientId,
  gridColor,
  lineColor,
  linePath,
  onPointerLeave,
  onPointerMove,
  transparentColor,
}: CurveSparklineGraphicProps) => (
  <div
    className={className ? `curve-kline-canvas ${className}` : 'curve-kline-canvas'}
    ref={containerRef}
    onMouseEnter={(event) => onPointerMove(event.clientX)}
    onMouseMove={(event) => onPointerMove(event.clientX)}
    onMouseLeave={onPointerLeave}
  >
    <svg
      className="curve-kline-surface"
      viewBox={`0 0 ${geometry.width} ${geometry.height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={gradientId}
          x1="0"
          y1={formatSvgCoordinate(geometry.plotTop)}
          x2="0"
          y2={formatSvgCoordinate(geometry.plotBottom)}
        >
          <stop offset="0%" stopColor={fillColor} />
          <stop offset="72%" stopColor={fillColor} />
          <stop offset="100%" stopColor={transparentColor} />
        </linearGradient>
      </defs>
      {Array.from({ length: 2 }, (_, index) => {
        const y =
          geometry.plotTop +
          ((geometry.plotBottom - geometry.plotTop) * (index + 1)) / 3;
        return (
          <line
            key={`grid-${index}`}
            x1="0"
            x2={formatSvgCoordinate(geometry.width)}
            y1={formatSvgCoordinate(y)}
            y2={formatSvgCoordinate(y)}
            stroke={gridColor}
            strokeWidth="1"
            strokeDasharray="9 7"
          />
        );
      })}
      <line
        x1="0"
        x2={formatSvgCoordinate(geometry.width)}
        y1={formatSvgCoordinate(geometry.baselineY)}
        y2={formatSvgCoordinate(geometry.baselineY)}
        stroke={baselineColor}
        strokeWidth="1"
        strokeDasharray="8 6"
      />
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path
        d={linePath}
        fill="none"
        stroke={lineColor}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {activePoint ? (
        <>
          <line
            x1={formatSvgCoordinate(activePoint.x)}
            x2={formatSvgCoordinate(activePoint.x)}
            y1="0"
            y2={formatSvgCoordinate(geometry.height)}
            stroke={crosshairColor}
            strokeWidth="1"
            strokeDasharray="4 6"
          />
          <circle
            cx={formatSvgCoordinate(activePoint.x)}
            cy={formatSvgCoordinate(activePoint.y)}
            r="4"
            fill={lineColor}
          />
        </>
      ) : null}
    </svg>
  </div>
);

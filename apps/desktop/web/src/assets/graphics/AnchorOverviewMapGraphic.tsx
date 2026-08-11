// SPDX-License-Identifier: GPL-3.0-only

type AnchorOverviewMapGraphicProps = {
  areaPath: string | null;
  linePath: string | null;
  width: number;
  height: number;
  ariaLabel: string;
  className?: string;
};

export const AnchorOverviewMapGraphic = ({
  areaPath,
  linePath,
  width,
  height,
  ariaLabel,
  className,
}: AnchorOverviewMapGraphicProps) => (
  <svg
    className={className}
    viewBox={`0 0 ${width} ${height}`}
    preserveAspectRatio="none"
    role="img"
    aria-label={ariaLabel}
  >
    {areaPath ? (
      <path className="anchor-nav-map-area-path" d={areaPath} />
    ) : null}
    {linePath ? (
      <path className="anchor-nav-map-line-path" d={linePath} />
    ) : null}
  </svg>
);

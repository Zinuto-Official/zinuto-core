// SPDX-License-Identifier: GPL-3.0-only

export type DesktopBrandEntryProps = {
  brandName: string;
  brandLogo: string;
  brandLogoAlt: string;
};

export const DesktopBrandEntry = ({
  brandName,
  brandLogo,
  brandLogoAlt,
}: DesktopBrandEntryProps) => (
  <div
    className="sidebar-brand-identity sidebar-brand-identity-static"
    aria-label={brandName}
  >
    <img src={brandLogo} alt={brandLogoAlt} />
    <span>{brandName}</span>
  </div>
);

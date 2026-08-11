// SPDX-License-Identifier: GPL-3.0-only

import brandLogoRoundedUrl from "@/assets/graphics/assets/branding/community-logo-rounded.png";

export const GRAPHIC_IMAGE_ASSET_URLS = Object.freeze({
  brandLogoRounded: brandLogoRoundedUrl,
});

export type GraphicImageAssetName = keyof typeof GRAPHIC_IMAGE_ASSET_URLS;

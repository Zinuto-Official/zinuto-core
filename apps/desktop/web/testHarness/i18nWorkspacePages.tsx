// SPDX-License-Identifier: GPL-3.0-only

import ReactDOM from "react-dom/client";
import { ensureLocaleCatalog } from "@zinuto/shared/i18n";
import { I18nProvider } from "../src/frontend-kernel/i18n";
import { ThemeProvider } from "../src/ui/theme/ThemeProvider";
import { I18nWorkspacePreviewSurface } from "./I18nWorkspacePreviewSurface";
import {
  locale,
  requestedPage,
  requestedTheme,
} from "./i18nWorkspacePreviewSupport";
import "../src/styles/index.css";
import "../src/styles/workspaces/strategy-backtest.css";

const root = ReactDOM.createRoot(document.getElementById("root")!);
await ensureLocaleCatalog(locale);
root.render(
  <ThemeProvider mode={requestedTheme} resolvedMode={requestedTheme}>
    <I18nProvider locale={locale}>
      <I18nWorkspacePreviewSurface page={requestedPage} />
    </I18nProvider>
  </ThemeProvider>,
);

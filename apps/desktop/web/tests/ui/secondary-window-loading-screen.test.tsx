// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SecondaryWindowLoadingSkeleton } from "../../src/app-shell/secondaryWindows/SecondaryWindowLoadingSkeleton";

test("secondary windows keep normal loading hidden and expose only recovery", () => {
  const loadingHtml = renderToStaticMarkup(
    <SecondaryWindowLoadingSkeleton
      kind="TRAINER_TRADING_ENVIRONMENT"
      state={null}
      status="loading"
    />,
  );

  assert.equal(loadingHtml, "");

  const errorHtml = renderToStaticMarkup(
    <SecondaryWindowLoadingSkeleton
      kind="TRAINER_TRADING_ENVIRONMENT"
      state={null}
      status="error"
      onClose={() => undefined}
      onRetry={() => undefined}
    />,
  );

  assert.match(errorHtml, /secondary-window-loading-unified/);
  assert.match(errorHtml, />Zinuto</);
  assert.match(
    errorHtml,
    /data-secondary-window-kind="TRAINER_TRADING_ENVIRONMENT"/,
  );
  assert.match(errorHtml, /data-secondary-window-loading-status="error"/);
  assert.match(errorHtml, />Close</);
  assert.match(errorHtml, />Retry</);
  assert.doesNotMatch(errorHtml, />Loading\.\.\.</);
});

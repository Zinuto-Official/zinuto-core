// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (relativePath: string): string =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

test("risk discipline settlement note card renders above the post-settlement actions", () => {
  const viewSource = readSource(
    "../../src/workspaces/special-training/components/SpecialTrainingRiskDisciplineTrainingView.tsx",
  );
  const riskCss = [1, 2]
    .map((layer) =>
      readSource(
        `../../src/styles/layout/workspace-overrides/02-special-training-risk-review.layer-0${layer}.css`,
      ),
    )
    .join("\n");
  const lightningResultsCss = [1, 2]
    .map((layer) =>
      readSource(
        `../../src/styles/layout/workspace-overrides/02-special-training-lightning-results.layer-0${layer}.css`,
      ),
    )
    .join("\n");

  const settlementBranchIndex = viewSource.indexOf(
    "{questionSettledInTraining ? (",
  );
  const noteCardIndex = viewSource.indexOf(
    'className="special-training-risk-note-card"',
    settlementBranchIndex,
  );
  const actionStackIndex = viewSource.indexOf(
    'className="special-training-lightning-action-stack is-post-settlement"',
    settlementBranchIndex,
  );
  const nextActionIndex = viewSource.indexOf(
    "content.settlementContinueLabel",
    actionStackIndex,
  );
  const exitActionIndex = viewSource.indexOf(
    "content.trainingExitLabel",
    nextActionIndex,
  );

  assert.notEqual(settlementBranchIndex, -1);
  assert.ok(noteCardIndex > settlementBranchIndex);
  assert.ok(actionStackIndex > noteCardIndex);
  assert.ok(nextActionIndex > actionStackIndex);
  assert.ok(exitActionIndex > nextActionIndex);

  assert.match(
    viewSource,
    /{onCreateChallengeReviewNote \? \(\s*<Button[\s\S]*className="special-training-risk-note-card"/,
  );
  assert.match(
    viewSource,
    /className="special-training-risk-note-card"[\s\S]*disabled={postSettlementActionsDisabled}/,
  );
  assert.doesNotMatch(
    viewSource,
    /special-training-settlement-note-row|special-training-settlement-note-btn-copy|special-training-settlement-note-btn-icon/,
  );
  assert.match(
    riskCss,
    /\.special-training-risk-note-card\[data-slot="button"\][\s\S]*width:\s*100%;[\s\S]*border:\s*1px solid var\(--special-training-risk-border\);[\s\S]*border-radius:\s*8px;[\s\S]*background:\s*var\(--special-training-risk-surface-soft\);/,
  );
  assert.match(
    riskCss,
    /\.special-training-risk-note-card\[data-slot="button"\]:disabled[\s\S]*color:\s*var\(--ui-action-disabled-text\);/,
  );
  assert.doesNotMatch(
    lightningResultsCss,
    /special-training-settlement-note-row|special-training-settlement-note-btn-copy|special-training-settlement-note-btn-icon/,
  );
});

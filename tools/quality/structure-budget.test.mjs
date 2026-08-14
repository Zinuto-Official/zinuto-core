// SPDX-License-Identifier: GPL-3.0-only

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  loadStructureBudget,
  validateStructureBudget,
} from './structure-budget.mjs';

const fixedNow = new Date('2026-08-09T00:00:00.000Z');
const valid = () => structuredClone(loadStructureBudget());
const validate = (document) => validateStructureBudget(document, { now: fixedNow });

test('the repository-local structure budget closes every exact unit and rollback', () => {
  const document = valid();
  assert.deepEqual(validate(document), {
    repository: document.repository,
    units: document.expectedUnitCount,
    rollbacks: document.expectedUnitCount,
  });
});

test('permanent structure budgets cannot retain temporary schedules', () => {
  const document = valid();
  document.units[0].deadline = '2026-08-08';
  assert.throws(() => validate(document), /permanent budget cannot carry temporary schedule fields/u);

  const legacyPolicy = valid();
  legacyPolicy.policy.asOf = '2026-08-09';
  assert.throws(() => validate(legacyPolicy), /policy\.asOf is obsolete/u);
});

test('temporary structure exceptions are bounded and expire', () => {
  const temporary = valid();
  Object.assign(temporary.units[0], {
    status: 'temporary-budget-exception',
    grantedOn: '2026-08-01',
    deadline: '2026-08-02',
    expiry: '2026-08-10',
  });
  assert.deepEqual(validate(temporary), {
    repository: temporary.repository,
    units: temporary.expectedUnitCount,
    rollbacks: temporary.expectedUnitCount,
  });

  const expired = valid();
  Object.assign(expired.units[0], {
    status: 'temporary-budget-exception',
    grantedOn: '2026-08-01',
    deadline: '2026-08-08',
    expiry: '2026-08-08',
  });
  assert.throws(() => validate(expired), /expired/u);

  const tooLong = valid();
  Object.assign(tooLong.units[0], {
    status: 'temporary-budget-exception',
    grantedOn: '2026-08-01',
    deadline: '2026-08-01',
    expiry: '2026-11-01',
  });
  assert.throws(() => validate(tooLong), /90-day exception maximum/u);
});

test('raised line budgets fail closed', () => {
  const document = valid();
  document.units[0].targetCeiling = document.units[0].previousCeiling + 1;
  assert.throws(() => validate(document), /raises its structure budget/u);
});

test('catch-all units fail closed', () => {
  const document = valid();
  document.units[0].seam = 'remaining and all other hotspots are owned by this catch-all unit';
  assert.throws(() => validate(document), /catch-all/u);
});

test('duplicate and unknown unit identities fail closed', () => {
  const duplicate = valid();
  duplicate.units[1].id = duplicate.units[0].id;
  assert.throws(() => validate(duplicate), /duplicate unit id/u);

  const unknown = valid();
  unknown.units.at(-1).id = 'HS-UNKNOWN-999';
  assert.throws(() => validate(unknown), /unknown or missing unit id/u);
});

test('missing independent rollback records fail closed', () => {
  const document = valid();
  document.rollbacks.pop();
  assert.throws(() => validate(document), /independent rollback/u);
});

test('missing current-owner and behavior-test paths fail closed', () => {
  const owner = valid();
  owner.units.find((unit) => unit.currentOwners.length > 1).currentOwners[1].path = 'missing-owner.ts';
  assert.throws(() => validate(owner), /missing or not a regular file/u);

  const behavior = valid();
  behavior.units[0].behaviorBaseline.testPath = 'missing-behavior.test.ts';
  assert.throws(() => validate(behavior), /missing or not a regular file/u);
});

test('truncated owner and rollback inventories fail closed', () => {
  const owner = valid();
  owner.units[0].currentOwners.pop();
  assert.throws(() => validate(owner), /rollback paths must exactly match currentOwners/u);

  const rollback = valid();
  rollback.rollbacks[0].paths.pop();
  assert.throws(() => validate(rollback), /rollback paths must exactly match currentOwners/u);
});

test('owner kind, role, and cross-unit path uniqueness fail closed', () => {
  const identity = valid();
  identity.units[0].currentOwners[1].kind = 'original-owner';
  assert.throws(() => validate(identity), /kind and role are invalid/u);

  const duplicate = valid();
  const duplicatePath = duplicate.units[0].currentOwners[1].path;
  duplicate.units[1].currentOwners[1].path = duplicatePath;
  const rollback = duplicate.rollbacks.find((entry) => entry.unitId === duplicate.units[1].id);
  rollback.paths = duplicate.units[1].currentOwners.map((owner) => owner.path);
  rollback.scope = `Restore ${rollback.paths[0]}; remove only these extracted owner paths: ${rollback.paths.slice(1).join(', ')}.`;
  assert.throws(() => validate(duplicate), /current-owner path across units/u);
});

test('future receipt references and string-only absence policies fail closed', () => {
  const future = valid();
  future.units[0].seam = 'Responsibility owners will be named by a future changed-path receipt.';
  assert.throws(() => validate(future), /future receipt reference/u);

  const absent = valid();
  absent.units[0].currentOwners = [];
  absent.units[0].absencePolicy = 'generated-overlay-delta';
  assert.throws(() => validate(absent), /string-only absence policies are not accepted/u);
});

test('symlink owner paths fail closed before any behavior evidence is accepted', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'zinuto-core-structure-budget-'));
  try {
    writeFileSync(path.join(root, 'target.ts'), 'export {};\n');
    symlinkSync('target.ts', path.join(root, 'owner-link.ts'));
    const document = valid();
    document.units[0].originalOwner.path = 'owner-link.ts';
    document.units[0].currentOwners[0].path = 'owner-link.ts';
    assert.throws(
      () => validateStructureBudget(document, { root, now: fixedNow }),
      /missing or not a regular file/u,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

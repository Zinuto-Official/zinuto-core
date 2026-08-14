// SPDX-License-Identifier: GPL-3.0-only

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = path.resolve(moduleDirectory, '../..');
export const configPath = path.join(repositoryRoot, 'config/structure-budget.v1.json');
export const expectedRepository = 'zinuto-core';
export const expectedUnitIds = Object.freeze(Array.from({ length: 76 }, (_, index) => `HS-CORE-${String(index + 1).padStart(3, '0')}`));

const CATCH_ALL_PATTERN = /(?:\*|\bremaining\b|\bmisc(?:ellaneous)?\b|\ball other\b|\bcatch[- ]?all\b)/iu;
const FUTURE_REFERENCE_PATTERN = /\bfuture\b/iu;
const OWNER_KINDS = Object.freeze({
  original: Object.freeze({
    kind: 'original-owner',
    role: 'stable-facade-or-post-remediation-owner',
  }),
  extracted: Object.freeze({
    kind: 'extracted-owner',
    role: 'extracted-responsibility-owner',
  }),
});

const fail = (message) => {
  throw new Error(`[structure-budget] ${message}`);
};

const assertSafeRelativePath = (value, label) => {
  if (
    typeof value !== 'string'
    || value.length === 0
    || path.isAbsolute(value)
    || value.includes('\\')
    || value.split('/').some((part) => part === '..' || part === '.' || part === '')
    || CATCH_ALL_PATTERN.test(value)
  ) {
    fail(`${label} must be one exact repository-relative path`);
  }
};

const assertRegularFile = (root, relativePath, label) => {
  assertSafeRelativePath(relativePath, label);
  const stat = fs.lstatSync(path.join(root, relativePath), { throwIfNoEntry: false });
  if (!stat?.isFile() || stat.isSymbolicLink()) fail(`${label} is missing or not a regular file: ${relativePath}`);
};

const lineCount = (absolutePath) => {
  const source = fs.readFileSync(absolutePath, 'utf8');
  if (source.length === 0) return 0;
  return source.replace(/\n$/u, '').split(/\r?\n/u).length;
};

const parseDate = (value, label) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    fail(`${label} must use YYYY-MM-DD`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) fail(`${label} is invalid`);
  return date;
};

const TEMPORARY_SCHEDULE_FIELDS = ['grantedOn', 'deadline', 'expiry'];
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

const validateBudgetLifecycle = (unit, today, maximumExceptionDays) => {
  const presentScheduleFields = TEMPORARY_SCHEDULE_FIELDS.filter((field) => hasOwn(unit, field));
  if (unit.status === 'remediated-budget-enforced') {
    if (presentScheduleFields.length > 0) {
      fail(`${unit.id} permanent budget cannot carry temporary schedule fields: ${presentScheduleFields.join(', ')}`);
    }
    return;
  }
  if (unit.status !== 'temporary-budget-exception') {
    fail(`${unit.id} status must be remediated-budget-enforced or temporary-budget-exception`);
  }
  if (presentScheduleFields.length !== TEMPORARY_SCHEDULE_FIELDS.length) {
    fail(`${unit.id} temporary budget exception requires grantedOn, deadline, and expiry`);
  }
  const grantedOn = parseDate(unit.grantedOn, `${unit.id} grantedOn`);
  const deadline = parseDate(unit.deadline, `${unit.id} deadline`);
  const expiry = parseDate(unit.expiry, `${unit.id} expiry`);
  if (grantedOn > deadline) fail(`${unit.id} deadline precedes its grant`);
  if (deadline > expiry) fail(`${unit.id} deadline exceeds expiry`);
  const maximumExpiry = new Date(grantedOn.valueOf() + (maximumExceptionDays * 86_400_000));
  if (expiry > maximumExpiry) fail(`${unit.id} expiry exceeds the 90-day exception maximum`);
  if (expiry < today) fail(`${unit.id} structure budget is expired`);
};

const unique = (values, label) => {
  if (new Set(values).size !== values.length) fail(`duplicate ${label}`);
};

const exactArray = (actual, expected) => (
  Array.isArray(actual)
  && actual.length === expected.length
  && actual.every((value, index) => value === expected[index])
);

const expectedRollbackScope = (originalPath, extractedPaths) => (
  `Restore ${originalPath}; remove only these extracted owner paths: ${extractedPaths.join(', ')}.`
);

export const loadStructureBudget = () => JSON.parse(fs.readFileSync(configPath, 'utf8'));

export const validateStructureBudget = (
  document,
  { root = repositoryRoot, now = new Date() } = {},
) => {
  if (!document || typeof document !== 'object' || Array.isArray(document)) fail('document must be an object');
  if (document.schemaVersion !== 1) fail('schemaVersion must be 1');
  if (document.repository !== expectedRepository) fail(`repository must be ${expectedRepository}`);
  if (document.authority !== `${expectedRepository}/config/structure-budget.v1.json`) fail('authority path is invalid');
  if (
    document.policy?.budgetsMayIncrease !== false
    || document.policy?.catchAllUnitsAllowed !== false
    || document.policy?.crossRepositoryNumericOwnershipAllowed !== false
    || document.policy?.maximumExceptionDays !== 90
  ) {
    fail('policy must forbid raised budgets, catch-all units, and cross-repository numeric ownership');
  }
  if (hasOwn(document.policy ?? {}, 'asOf')) {
    fail('policy.asOf is obsolete; temporary exceptions must declare unit.grantedOn');
  }
  if (!Array.isArray(document.units) || !Array.isArray(document.rollbacks)) fail('units and rollbacks must be arrays');
  if (document.expectedUnitCount !== expectedUnitIds.length || document.units.length !== expectedUnitIds.length) {
    fail(`expected exactly ${expectedUnitIds.length} units`);
  }

  const unitIds = document.units.map((unit) => unit?.id);
  unique(unitIds, 'unit id');
  const expectedSet = new Set(expectedUnitIds);
  if (unitIds.some((id) => !expectedSet.has(id)) || expectedUnitIds.some((id) => !unitIds.includes(id))) {
    fail('unknown or missing unit id');
  }

  const rollbackIds = document.rollbacks.map((rollback) => rollback?.id);
  unique(rollbackIds, 'rollback id');
  if (document.rollbacks.length !== document.units.length) fail('each unit requires one independent rollback record');
  const rollbackByUnit = new Map();
  for (const rollback of document.rollbacks) {
    if (!expectedSet.has(rollback?.unitId)) fail('rollback references an unknown unit');
    if (rollbackByUnit.has(rollback.unitId)) fail('duplicate rollback unit');
    rollbackByUnit.set(rollback.unitId, rollback);
  }

  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const originalPaths = [];
  const currentOwnerPaths = [];

  for (const unit of document.units) {
    const serializedUnit = JSON.stringify(unit);
    if (CATCH_ALL_PATTERN.test(serializedUnit)) fail(`${unit.id} contains a catch-all token`);
    if (FUTURE_REFERENCE_PATTERN.test(serializedUnit)) fail(`${unit.id} contains a future receipt reference`);
    if (typeof unit.owner !== 'string' || !/^OWN-[A-Z0-9-]+$/u.test(unit.owner)) fail(`${unit.id} owner is invalid`);
    if (typeof unit.domain !== 'string' || unit.domain.length < 3) fail(`${unit.id} domain is invalid`);
    if (typeof unit.seam !== 'string' || unit.seam.length < 32) fail(`${unit.id} seam is missing`);
    assertSafeRelativePath(unit.originalOwner?.path, `${unit.id} original owner`);
    originalPaths.push(unit.originalOwner.path);
    if (!Number.isInteger(unit.originalOwner?.baselineLines) || unit.originalOwner.baselineLines < 1) {
      fail(`${unit.id} baseline lines are invalid`);
    }
    if (!/^[a-f0-9]{64}$/u.test(unit.originalOwner?.baselineSha256 ?? '')) fail(`${unit.id} baseline digest is invalid`);
    if (!Number.isInteger(unit.previousCeiling) || !Number.isInteger(unit.targetCeiling) || unit.targetCeiling < 1) {
      fail(`${unit.id} ceilings must be positive integers`);
    }
    if (unit.targetCeiling > unit.previousCeiling) fail(`${unit.id} raises its structure budget`);

    validateBudgetLifecycle(unit, today, document.policy.maximumExceptionDays);

    if (!Array.isArray(unit.currentOwners) || unit.currentOwners.length === 0) {
      fail(`${unit.id} must bind every current owner; string-only absence policies are not accepted`);
    }
    if (unit.absencePolicy !== null) fail(`${unit.id} cannot combine current owners with an absence policy`);
    const ownerPaths = unit.currentOwners.map((owner) => owner?.path);
    unique(ownerPaths, `${unit.id} current-owner path`);
    if (ownerPaths[0] !== unit.originalOwner.path) fail(`${unit.id} must list its original owner first`);
    for (const [index, owner] of unit.currentOwners.entries()) {
      const expectedIdentity = index === 0 ? OWNER_KINDS.original : OWNER_KINDS.extracted;
      if (owner?.kind !== expectedIdentity.kind || owner?.role !== expectedIdentity.role) {
        fail(`${unit.id} current-owner kind and role are invalid for ${owner?.path ?? '<missing>'}`);
      }
      assertRegularFile(root, owner?.path, `${unit.id} current owner`);
      if (!Number.isInteger(owner?.lineCeiling) || owner.lineCeiling < 1 || owner.lineCeiling > unit.targetCeiling) {
        fail(`${unit.id} current-owner ceiling exceeds its target`);
      }
      const actualLines = lineCount(path.join(root, owner.path));
      if (actualLines > owner.lineCeiling) {
        fail(`${unit.id} current owner ${owner.path} has ${actualLines} lines; ceiling is ${owner.lineCeiling}`);
      }
      currentOwnerPaths.push(owner.path);
    }

    if (typeof unit.behaviorBaseline?.description !== 'string' || unit.behaviorBaseline.description.length < 32) {
      fail(`${unit.id} behavior baseline is missing`);
    }
    assertRegularFile(root, unit.behaviorBaseline?.testPath, `${unit.id} behavior test`);
    const rollback = rollbackByUnit.get(unit.id);
    if (!rollback || rollback.id !== unit.rollbackId || rollback.id !== `RB-${unit.id}`) {
      fail(`${unit.id} independent rollback identity is invalid`);
    }
    if (!Array.isArray(rollback.paths) || rollback.paths.length === 0) fail(`${unit.id} rollback paths are missing`);
    unique(rollback.paths, `${unit.id} rollback path`);
    for (const rollbackPath of rollback.paths) assertSafeRelativePath(rollbackPath, `${unit.id} rollback path`);
    if (!exactArray(rollback.paths, ownerPaths)) {
      fail(`${unit.id} rollback paths must exactly match currentOwners in order`);
    }
    const expectedScope = expectedRollbackScope(unit.originalOwner.path, ownerPaths.slice(1));
    if (rollback.scope !== expectedScope) {
      fail(`${unit.id} rollback scope must name every current owner and no future receipt`);
    }
  }
  unique(originalPaths, 'original-owner path');
  unique(currentOwnerPaths, 'current-owner path across units');
  return { repository: expectedRepository, units: unitIds.length, rollbacks: rollbackIds.length };
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = validateStructureBudget(loadStructureBudget());
    process.stdout.write(`[structure-budget] ${result.repository}: ${result.units} units and ${result.rollbacks} independent rollbacks are valid\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

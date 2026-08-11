// SPDX-License-Identifier: GPL-3.0-only

import { db } from "../database.js";
import { nowIso } from "../../../kernel/time.js";
import {
  SYSTEM_DEV_SIMULATION_PROFILE_SPEC_VERSION,
  type SystemDevSimulationEffectivePlan,
  resolveSystemDevSimulationProfileId,
  type SystemDevSimulationProfileId,
} from "@zinuto/shared/systemDevSimulationProfiles";

export type SystemDevSimulationBatchRecord = {
  id: string;
  profileId: SystemDevSimulationProfileId;
  seed: string;
  specVersion: number;
  effectivePlan: SystemDevSimulationEffectivePlan | null;
  createdAt: string;
  finishedAt: string | null;
};

type BatchRow = {
  id: string;
  profile_id: string;
  seed: string;
  spec_version: number | null;
  effective_plan_json: string | null;
  created_at: string;
  finished_at: string | null;
};

const parseEffectivePlan = (
  value: unknown,
): SystemDevSimulationEffectivePlan | null => {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as SystemDevSimulationEffectivePlan;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

const mapBatchRow = (row: BatchRow): SystemDevSimulationBatchRecord => ({
  id: row.id,
  profileId: resolveSystemDevSimulationProfileId(row.profile_id),
  seed: String(row.seed ?? "").trim() || row.id,
  specVersion: Math.max(
    1,
    Math.floor(Number(row.spec_version) || SYSTEM_DEV_SIMULATION_PROFILE_SPEC_VERSION),
  ),
  effectivePlan: parseEffectivePlan(row.effective_plan_json),
  createdAt: String(row.created_at ?? "").trim() || nowIso(),
  finishedAt:
    typeof row.finished_at === "string" && row.finished_at.trim()
      ? row.finished_at
      : null,
});

export const upsertSystemDevSimulationBatch = (input: {
  id: string;
  profileId: SystemDevSimulationProfileId;
  seed: string;
  specVersion?: number;
  effectivePlan?: SystemDevSimulationEffectivePlan | null;
  createdAt?: string;
  finishedAt?: string | null;
}): SystemDevSimulationBatchRecord => {
  const id = String(input.id ?? "").trim();
  const createdAt = String(input.createdAt ?? "").trim() || nowIso();
  const finishedAt =
    typeof input.finishedAt === "string" && input.finishedAt.trim()
      ? input.finishedAt
      : null;
  const seed = String(input.seed ?? "").trim() || id;
  const profileId = resolveSystemDevSimulationProfileId(input.profileId);
  const specVersion = Math.max(
    1,
    Math.floor(Number(input.specVersion) || SYSTEM_DEV_SIMULATION_PROFILE_SPEC_VERSION),
  );
  const effectivePlanJson = input.effectivePlan
    ? JSON.stringify(input.effectivePlan)
    : null;
  db.prepare(
    `INSERT INTO system_dev_simulation_batches (
      id,profile_id,seed,spec_version,effective_plan_json,created_at,finished_at
    ) VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      profile_id = excluded.profile_id,
      seed = excluded.seed,
      spec_version = excluded.spec_version,
      effective_plan_json = excluded.effective_plan_json,
      created_at = excluded.created_at,
      finished_at = excluded.finished_at`,
  ).run(
    id,
    profileId,
    seed,
    specVersion,
    effectivePlanJson,
    createdAt,
    finishedAt,
  );
  return {
    id,
    profileId,
    seed,
    specVersion,
    effectivePlan: input.effectivePlan ?? null,
    createdAt,
    finishedAt,
  };
};

export const finishSystemDevSimulationBatch = (
  batchId: string,
  finishedAt = nowIso(),
): void => {
  const normalizedBatchId = String(batchId ?? "").trim();
  if (!normalizedBatchId) {
    return;
  }
  db.prepare(
    `UPDATE system_dev_simulation_batches
        SET finished_at = ?
      WHERE id = ?`,
  ).run(finishedAt, normalizedBatchId);
};

export const getSystemDevSimulationBatch = (
  batchId: string,
): SystemDevSimulationBatchRecord | null => {
  const normalizedBatchId = String(batchId ?? "").trim();
  if (!normalizedBatchId) {
    return null;
  }
  const row = db
    .prepare(
      `SELECT id,profile_id,seed,spec_version,effective_plan_json,created_at,finished_at
         FROM system_dev_simulation_batches
        WHERE id = ?
        LIMIT 1`,
    )
    .get(normalizedBatchId) as BatchRow | undefined;
  return row ? mapBatchRow(row) : null;
};

export const listSystemDevSimulationBatchIds = (): string[] =>
  (
    db
      .prepare(
        `SELECT id
           FROM system_dev_simulation_batches
          ORDER BY created_at DESC, id DESC`,
      )
      .all() as Array<{ id?: string }>
  )
    .map((row) => String(row.id ?? "").trim())
    .filter((id) => id.length > 0);

export const deleteSystemDevSimulationBatches = (
  batchIds: readonly string[],
): number => {
  const normalizedBatchIds = Array.from(
    new Set(
      batchIds
        .map((batchId) => String(batchId ?? "").trim())
        .filter((batchId) => batchId.length > 0),
    ),
  );
  if (!normalizedBatchIds.length) {
    return 0;
  }
  const placeholders = normalizedBatchIds.map(() => "?").join(",");
  return db
    .prepare(
      `DELETE FROM system_dev_simulation_batches
        WHERE id IN (${placeholders})`,
    )
    .run(...normalizedBatchIds).changes;
};

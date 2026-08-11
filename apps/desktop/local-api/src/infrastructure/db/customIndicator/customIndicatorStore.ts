// SPDX-License-Identifier: GPL-3.0-only

import { db } from '../database.js';

export type CustomIndicatorProfileRow = {
  id: string;
  name: string;
  source: string;
  parameter_inputs_json: string;
  revisions_json: string;
  created_at: string;
  updated_at: string;
};

export type CustomIndicatorProfileInsertRow = {
  id: string;
  name: string;
  source: string;
  parameterInputsJson: string;
  revisionsJson: string;
  createdAt: string;
  updatedAt: string;
};

const listProfilesStmt = db.prepare(
  `SELECT id,name,source,parameter_inputs_json,revisions_json,created_at,updated_at
   FROM custom_indicator_profiles
   ORDER BY updated_at DESC, created_at DESC, id DESC`,
);

const deleteAllProfilesStmt = db.prepare('DELETE FROM custom_indicator_profiles');

const insertProfileStmt = db.prepare(
  `INSERT INTO custom_indicator_profiles (
    id,name,source,parameter_inputs_json,revisions_json,created_at,updated_at
  ) VALUES (?,?,?,?,?,?,?)`,
);

export const listCustomIndicatorProfileRows = (): CustomIndicatorProfileRow[] =>
  listProfilesStmt.all() as CustomIndicatorProfileRow[];

export const replaceCustomIndicatorProfileRows = (
  profiles: readonly CustomIndicatorProfileInsertRow[],
): void => {
  const tx = db.transaction(() => {
    deleteAllProfilesStmt.run();
    profiles.forEach((profile) => {
      insertProfileStmt.run(
        profile.id,
        profile.name,
        profile.source,
        profile.parameterInputsJson,
        profile.revisionsJson,
        profile.createdAt,
        profile.updatedAt,
      );
    });
  });
  tx();
};

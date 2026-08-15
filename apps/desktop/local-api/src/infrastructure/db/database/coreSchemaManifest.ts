// SPDX-License-Identifier: GPL-3.0-only

import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import { DB_SCHEMA_VERSION } from "./constants.js";
import { schemaSql } from "./schemaSql.js";

export const SUPPORTED_CORE_SCHEMA_MANIFEST_VERSIONS = [] as const;
export type SupportedCoreSchemaManifestVersion =
  (typeof SUPPORTED_CORE_SCHEMA_MANIFEST_VERSIONS)[number];

type CoreSchemaManifest = {
  tables: Array<{
    name: string;
    createBody: string;
    columns: Array<{
      cid: number;
      name: string;
      type: string;
      notnull: number;
      defaultValue: string | null;
      pk: number;
      hidden: number;
    }>;
    foreignKeys: Array<{
      id: number;
      seq: number;
      table: string;
      from: string;
      to: string;
      onUpdate: string;
      onDelete: string;
      match: string;
    }>;
  }>;
  indexes: Array<{
    name: string;
    tableName: string;
    sql: string;
  }>;
  otherObjects: Array<{
    type: string;
    name: string;
    tableName: string;
    sql: string;
  }>;
};

const quoteSqlIdentifier = (value: string): string =>
  `"${String(value).replaceAll('"', '""')}"`;

const normalizeSql = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .replace(/\s+/gu, " ");

const normalizeCreateBody = (value: unknown): string => {
  const sql = String(value ?? "");
  const bodyStart = sql.indexOf("(");
  return normalizeSql(bodyStart >= 0 ? sql.slice(bodyStart) : sql);
};

const captureCoreSchemaManifest = (
  db: Database.Database,
): CoreSchemaManifest => {
  const objects = db
    .prepare(
      `SELECT type, name, tbl_name AS table_name, sql
         FROM sqlite_master
        WHERE name NOT LIKE 'sqlite_%'
        ORDER BY type ASC, name ASC`,
    )
    .all() as Array<{
      type?: unknown;
      name?: unknown;
      table_name?: unknown;
      sql?: unknown;
    }>;
  const tables = objects
    .filter((row) => String(row.type ?? "") === "table")
    .map((row) => {
      const name = String(row.name ?? "");
      const columns = db
        .prepare(`PRAGMA table_xinfo(${quoteSqlIdentifier(name)})`)
        .all() as Array<Record<string, unknown>>;
      const foreignKeys = db
        .prepare(`PRAGMA foreign_key_list(${quoteSqlIdentifier(name)})`)
        .all() as Array<Record<string, unknown>>;
      return {
        name,
        createBody: normalizeCreateBody(row.sql),
        columns: columns.map((column) => ({
          cid: Number(column.cid),
          name: String(column.name ?? ""),
          type: String(column.type ?? "").toUpperCase(),
          notnull: Number(column.notnull),
          defaultValue:
            column.dflt_value === null || column.dflt_value === undefined
              ? null
              : normalizeSql(column.dflt_value),
          pk: Number(column.pk),
          hidden: Number(column.hidden ?? 0),
        })),
        foreignKeys: foreignKeys.map((foreignKey) => ({
          id: Number(foreignKey.id),
          seq: Number(foreignKey.seq),
          table: String(foreignKey.table ?? ""),
          from: String(foreignKey.from ?? ""),
          to: String(foreignKey.to ?? ""),
          onUpdate: String(foreignKey.on_update ?? "").toUpperCase(),
          onDelete: String(foreignKey.on_delete ?? "").toUpperCase(),
          match: String(foreignKey.match ?? "").toUpperCase(),
        })),
      };
    });
  const indexes = objects
    .filter((row) => String(row.type ?? "") === "index" && row.sql)
    .map((row) => ({
      name: String(row.name ?? ""),
      tableName: String(row.table_name ?? ""),
      sql: normalizeSql(row.sql),
    }));
  const otherObjects = objects
    .filter((row) => !["table", "index"].includes(String(row.type ?? "")))
    .map((row) => ({
      type: String(row.type ?? ""),
      name: String(row.name ?? ""),
      tableName: String(row.table_name ?? ""),
      sql: normalizeSql(row.sql),
    }));
  return { tables, indexes, otherObjects };
};

const fingerprintCoreSchemaManifest = (manifest: CoreSchemaManifest): string =>
  createHash("sha256").update(JSON.stringify(manifest)).digest("hex");

const buildCurrentManifest = (): CoreSchemaManifest => {
  const db = new Database(":memory:");
  try {
    db.exec(schemaSql);
    return captureCoreSchemaManifest(db);
  } finally {
    db.close();
  }
};

const currentManifest = buildCurrentManifest();
const currentFingerprint = fingerprintCoreSchemaManifest(currentManifest);

export const PINNED_CORE_SCHEMA_MANIFEST_SHA256 = Object.freeze({
  [DB_SCHEMA_VERSION]:
    "037b6ea254f019b3c80deec7ac753c58aa8477ffcd8c5cf030038aa0fc1534bf",
});

export const computeCoreSchemaManifestFingerprint = (
  version: typeof DB_SCHEMA_VERSION,
): string => {
  if (version !== DB_SCHEMA_VERSION) {
    throw new Error("CORE_SCHEMA_MANIFEST_VERSION_UNSUPPORTED");
  }
  if (currentFingerprint !== PINNED_CORE_SCHEMA_MANIFEST_SHA256[DB_SCHEMA_VERSION]) {
    throw new Error("CORE_SCHEMA_MANIFEST_DEFINITION_DRIFT");
  }
  return currentFingerprint;
};

export const inspectCoreSchemaManifest = (
  db: Database.Database,
  version: string,
): string[] => {
  if (version !== DB_SCHEMA_VERSION) {
    return [`schema-version:${version || "missing"}`];
  }
  computeCoreSchemaManifestFingerprint(DB_SCHEMA_VERSION);
  const actual = captureCoreSchemaManifest(db);
  if (JSON.stringify(actual) === JSON.stringify(currentManifest)) {
    return [];
  }
  const expectedTables = new Set(
    currentManifest.tables.map((table) => table.name),
  );
  const actualTables = new Set(actual.tables.map((table) => table.name));
  const details = [
    ...actual.tables
      .filter((table) => !expectedTables.has(table.name))
      .map((table) => `${table.name}:<unexpected-table>`),
    ...currentManifest.tables
      .filter((table) => !actualTables.has(table.name))
      .map((table) => `${table.name}:<missing-table>`),
  ];
  for (const expectedTable of currentManifest.tables) {
    const actualTable = actual.tables.find(
      (table) => table.name === expectedTable.name,
    );
    if (!actualTable) {
      continue;
    }
    const expectedColumns = new Set(
      expectedTable.columns.map((column) => column.name),
    );
    const actualColumns = new Set(
      actualTable.columns.map((column) => column.name),
    );
    const tableDetails = [
      ...expectedTable.columns
        .filter((column) => !actualColumns.has(column.name))
        .map((column) => `${expectedTable.name}:${column.name}`),
      ...actualTable.columns
        .filter((column) => !expectedColumns.has(column.name))
        .map(
          (column) =>
            `${expectedTable.name}:<unexpected-column:${column.name}>`,
        ),
    ];
    if (
      tableDetails.length === 0 &&
      JSON.stringify(actualTable) !== JSON.stringify(expectedTable)
    ) {
      tableDetails.push(`${expectedTable.name}:<definition-mismatch>`);
    }
    details.push(...tableDetails);
  }
  const expectedIndexes = new Set(
    currentManifest.indexes.map((index) => index.name),
  );
  const actualIndexes = new Set(actual.indexes.map((index) => index.name));
  details.push(
    ...currentManifest.indexes
      .filter((index) => !actualIndexes.has(index.name))
      .map((index) => `${index.tableName}:<missing-index:${index.name}>`),
    ...actual.indexes
      .filter((index) => !expectedIndexes.has(index.name))
      .map((index) => `${index.tableName}:<unexpected-index:${index.name}>`),
  );
  return details.length > 0 ? details : ["schema-fingerprint:mismatch"];
};

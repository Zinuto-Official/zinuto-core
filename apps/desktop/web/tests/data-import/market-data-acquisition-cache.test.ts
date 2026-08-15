// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";
import {
  readMarketDataAcquisitionFolderPreference,
  writeMarketDataAcquisitionFolderPreference,
} from "../../src/workspaces/data/dataConfig/marketDataAcquisitionCache";

const createMemoryStorage = (): Storage => {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
};

test("the last authorized download folder is restored only with a safe grant", () => {
  const storage = createMemoryStorage();
  const preference = {
    grantId: "acquisition-grant-remembered_1234",
    displayPath: "/Volumes/Zinuto/Downloads",
  };

  writeMarketDataAcquisitionFolderPreference(preference, storage);
  assert.deepEqual(
    readMarketDataAcquisitionFolderPreference(storage),
    preference,
  );

  storage.setItem(
    "zinuto.marketDataAcquisition.folder.v1",
    JSON.stringify({
      version: 1,
      grantId: "../unsafe",
      displayPath: "/Volumes/Zinuto/Downloads",
    }),
  );
  assert.equal(readMarketDataAcquisitionFolderPreference(storage), null);
});

// SPDX-License-Identifier: GPL-3.0-only

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = path.resolve(SCRIPT_DIR, "..");
const SOURCE_SYSTEM_MARKET_SEED_DIR = path.join(
  BACKEND_DIR,
  "src",
  "infrastructure",
  "assets",
  "system-market-seed",
);
const TARGET_SYSTEM_MARKET_SEED_DIR = path.join(
  BACKEND_DIR,
  "dist",
  "infrastructure",
  "assets",
  "system-market-seed",
);

const copyPath = (sourcePath, targetPath) => {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.cpSync(sourcePath, targetPath, {
    recursive: true,
    force: true,
    dereference: true,
  });
};

if (fs.existsSync(SOURCE_SYSTEM_MARKET_SEED_DIR)) {
  fs.rmSync(TARGET_SYSTEM_MARKET_SEED_DIR, { recursive: true, force: true });
  fs.mkdirSync(TARGET_SYSTEM_MARKET_SEED_DIR, { recursive: true });
  copyPath(SOURCE_SYSTEM_MARKET_SEED_DIR, TARGET_SYSTEM_MARKET_SEED_DIR);
}

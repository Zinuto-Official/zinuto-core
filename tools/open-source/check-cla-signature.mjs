// SPDX-License-Identifier: GPL-3.0-only

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const readValue = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const actor = readValue('--actor') ?? process.env.GITHUB_ACTOR;
const registryPath = path.resolve(
  readValue('--file') ?? 'contributors/cla-signatures.json',
);

if (!actor) {
  throw new Error('Missing pull-request actor. Pass --actor <github-login>.');
}

const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
if (registry.agreementVersion !== '1.0' || !Array.isArray(registry.signatures)) {
  throw new Error('The CLA registry must use agreementVersion 1.0.');
}

const normalizedActor = actor.trim().toLowerCase();
const signature = registry.signatures.find(
  (entry) => String(entry.login ?? '').trim().toLowerCase() === normalizedActor,
);

if (!signature) {
  throw new Error(
    `${actor} has not acknowledged the Zinuto CLA in contributors/cla-signatures.json.`,
  );
}

if (!['individual', 'corporate'].includes(signature.type)) {
  throw new Error(`Invalid CLA signature type for ${actor}.`);
}

if (!/^\d{4}-\d{2}-\d{2}$/.test(String(signature.signedAt ?? ''))) {
  throw new Error(`Invalid CLA signedAt date for ${actor}.`);
}

if (
  signature.type === 'corporate' &&
  (!String(signature.company ?? '').trim() ||
    !String(signature.authorizedBy ?? '').trim())
) {
  throw new Error(`Corporate CLA entry for ${actor} lacks authorization details.`);
}

process.stdout.write(`CLA 1.0 acknowledgement found for ${actor}.\n`);

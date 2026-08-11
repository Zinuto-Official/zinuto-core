// SPDX-License-Identifier: GPL-3.0-only

import fs from 'node:fs';
import https from 'node:https';

const NOFOLLOW = fs.constants.O_NOFOLLOW ?? 0;

const validateDownloadUrl = (descriptor) => {
  const url = new URL(descriptor.archiveUrl);
  if (
    url.protocol !== 'https:'
    || url.hostname !== 'nodejs.org'
    || url.port !== ''
    || url.username
    || url.password
    || url.search
    || url.hash
    || url.pathname !== `/dist/v${descriptor.releaseVersion}/${descriptor.archiveFileName}`
  ) {
    throw new Error('native runtime download URL does not match signed authority');
  }
  return url;
};

export const downloadRuntimeArchive = ({
  descriptor,
  destinationPath,
  get = https.get,
  overallTimeoutMs = 30000,
  idleTimeoutMs = 10000,
}) => new Promise((resolve, reject) => {
  const url = validateDownloadUrl(descriptor);
  let settled = false;
  let request;
  const finish = (error) => {
    if (settled) return;
    settled = true;
    clearTimeout(overallTimer);
    if (error) reject(error);
    else resolve();
  };
  const overallTimer = setTimeout(() => {
    request?.destroy(new Error('native runtime download exceeded overall deadline'));
  }, overallTimeoutMs);
  try {
    request = get(url, {
      headers: { accept: 'application/octet-stream', 'accept-encoding': 'identity' },
      maxRedirects: 0,
      rejectUnauthorized: true,
    }, (response) => {
      if (response.statusCode !== 200) {
        response.resume();
        const redirect = response.statusCode && response.statusCode >= 300 && response.statusCode < 400;
        finish(new Error(redirect ? 'native runtime download redirect is forbidden' : `native runtime download returned HTTP ${response.statusCode ?? 0}`));
        return;
      }
      if (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity') {
        response.resume();
        finish(new Error('native runtime download content encoding is forbidden'));
        return;
      }
      const contentLengthValue = response.headers['content-length'];
      if (Array.isArray(contentLengthValue) || !/^\d+$/u.test(String(contentLengthValue ?? ''))) {
        response.resume();
        finish(new Error('native runtime download requires one exact content-length'));
        return;
      }
      if (Number(contentLengthValue) !== descriptor.archiveBytes) {
        response.resume();
        finish(new Error('native runtime download content-length mismatch'));
        return;
      }
      response.setTimeout?.(idleTimeoutMs, () => {
        response.destroy(new Error('native runtime download exceeded idle deadline'));
      });
      const chunks = [];
      let received = 0;
      response.on('data', (chunk) => {
        received += chunk.length;
        if (received > descriptor.archiveBytes) {
          response.destroy(new Error('native runtime download exceeded signed byte length'));
          return;
        }
        chunks.push(Buffer.from(chunk));
      });
      response.once('error', finish);
      response.once('end', () => {
        if (received !== descriptor.archiveBytes) {
          finish(new Error('native runtime download ended before signed byte length'));
          return;
        }
        let handle;
        try {
          handle = fs.openSync(
            destinationPath,
            fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | NOFOLLOW,
            0o600,
          );
          const content = Buffer.concat(chunks, received);
          let offset = 0;
          while (offset < content.length) {
            const written = fs.writeSync(handle, content, offset, content.length - offset, offset);
            if (written <= 0) throw new Error('native runtime download write stopped early');
            offset += written;
          }
          fs.fsyncSync(handle);
          fs.closeSync(handle);
          handle = undefined;
          finish();
        } catch (error) {
          if (handle !== undefined) fs.closeSync(handle);
          finish(error);
        }
      });
    });
    request.setTimeout?.(idleTimeoutMs, () => {
      request.destroy(new Error('native runtime download exceeded connection deadline'));
    });
    request.once('error', finish);
  } catch (error) {
    finish(error);
  }
});

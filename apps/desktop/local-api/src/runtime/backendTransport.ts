// SPDX-License-Identifier: GPL-3.0-only

import path from 'node:path';
import { appError } from '../kernel/appError.js';
import { resolveDesktopBackendTransportType } from './desktopRuntime.js';

export const BACKEND_LOOPBACK_HOST = '127.0.0.1';

type UnixBackendTransportConfig = {
  type: 'unix';
  socketPath: string;
  socketPathLengthBytes: number;
  socketPathMaxBytes: number;
  host: null;
  port: null;
};

type TcpBackendTransportConfig = {
  type: 'tcp';
  socketPath: null;
  socketPathLengthBytes: 0;
  socketPathMaxBytes: null;
  host: string;
  port: number;
};

export type BackendTransportConfig =
  | UnixBackendTransportConfig
  | TcpBackendTransportConfig;

type ResolveBackendTransportConfigOptions = {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  loopbackHost?: string;
};

const resolveUnixSocketPathMaxBytes = (
  platform: NodeJS.Platform = process.platform,
): number => (platform === 'darwin' ? 103 : 107);

export const resolveBackendTransportConfig = ({
  env = process.env,
  platform = process.platform,
  loopbackHost = BACKEND_LOOPBACK_HOST,
}: ResolveBackendTransportConfigOptions = {}): BackendTransportConfig => {
  const expectedTransportType = resolveDesktopBackendTransportType(platform);
  const socketPathRaw =
    typeof env.ZINUTO_BACKEND_SOCKET === 'string'
      ? env.ZINUTO_BACKEND_SOCKET.trim()
      : '';
  if (expectedTransportType === 'unix') {
    if (!socketPathRaw) {
      throw appError('BACKEND_TRANSPORT_REQUIRED');
    }
    const socketPath = path.resolve(socketPathRaw);
    return {
      type: 'unix',
      socketPath,
      socketPathLengthBytes: Buffer.byteLength(socketPath),
      socketPathMaxBytes: resolveUnixSocketPathMaxBytes(platform),
      host: null,
      port: null,
    };
  }

  const portRaw =
    typeof env.ZINUTO_BACKEND_PORT === 'string'
      ? env.ZINUTO_BACKEND_PORT.trim()
      : '';
  const parsedPort = Number.parseInt(portRaw, 10);
  if (expectedTransportType === 'tcp') {
    if (
      !Number.isInteger(parsedPort) ||
      parsedPort <= 0 ||
      parsedPort > 65535
    ) {
      throw appError('BACKEND_TRANSPORT_REQUIRED');
    }
    return {
      type: 'tcp',
      socketPath: null,
      socketPathLengthBytes: 0,
      socketPathMaxBytes: null,
      host: loopbackHost,
      port: parsedPort,
    };
  }

  if (socketPathRaw) {
    const socketPath = path.resolve(socketPathRaw);
    return {
      type: 'unix',
      socketPath,
      socketPathLengthBytes: Buffer.byteLength(socketPath),
      socketPathMaxBytes: resolveUnixSocketPathMaxBytes(platform),
      host: null,
      port: null,
    };
  }

  if (
    Number.isInteger(parsedPort) &&
    parsedPort > 0 &&
    parsedPort <= 65535
  ) {
    return {
      type: 'tcp',
      socketPath: null,
      socketPathLengthBytes: 0,
      socketPathMaxBytes: null,
      host: loopbackHost,
      port: parsedPort,
    };
  }

  throw appError('BACKEND_TRANSPORT_REQUIRED');
};

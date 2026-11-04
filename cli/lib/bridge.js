// HTTP client for the server that the Unity package runs inside the Editor.
//
// The contract is shared with Unity packages that users already have installed,
// so it must stay backward compatible:
//   GET /refresh         -> {"status":"ok"}        queues AssetDatabase.Refresh()
//   GET /ping            -> {"isCompiling":bool}
//   GET /compile-errors  -> [{"File","Line","Message"}]

import http from 'node:http';
import { BRIDGE_URL } from './constants.js';

export class BridgeError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'BridgeError';
    this.code = code;
  }
}

export function createBridge({ baseUrl = BRIDGE_URL, timeoutMs = 2000 } = {}) {
  const get = (path) =>
    new Promise((resolve, reject) => {
      const req = http.get(`${baseUrl}${path}`, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new BridgeError(`HTTP ${res.statusCode} from ${path}`, 'BAD_STATUS'));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch {
            reject(new BridgeError(`Invalid JSON from ${path}`, 'BAD_JSON'));
          }
        });
      });
      req.on('error', (err) => reject(new BridgeError(describe(err), err.code || 'NETWORK')));
      req.setTimeout(timeoutMs, () => req.destroy(Object.assign(new Error('timed out'), { code: 'TIMEOUT' })));
    });

  return {
    url: baseUrl,
    ping: () => get('/ping'),
    refresh: () => get('/refresh'),
    compileErrors: async () => {
      const entries = await get('/compile-errors');
      if (!Array.isArray(entries)) throw new BridgeError('Unexpected response from /compile-errors', 'BAD_JSON');
      return entries;
    },
  };
}

function describe(err) {
  switch (err.code) {
    case 'ECONNREFUSED':
      return 'connection refused';
    case 'ECONNRESET':
      return 'connection reset';
    case 'TIMEOUT':
      return 'timed out';
    default:
      return err.message;
  }
}

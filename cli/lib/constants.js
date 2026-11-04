import { createRequire } from 'node:module';

const pkg = createRequire(import.meta.url)('../../package.json');

export const VERSION = pkg.version;
export const REPO_URL = 'https://github.com/ruizhengu/unity-beaver';

// The Unity package listens here. The port is fixed in UnityAgentServer.cs.
// UNITY_AGENT_BRIDGE_URL exists so the test suite can point at a mock server.
export const BRIDGE_URL = process.env.UNITY_AGENT_BRIDGE_URL || 'http://127.0.0.1:5142';

export const PACKAGE_NAME = 'com.unityagentbridge.server';
export const PACKAGE_URL = `${REPO_URL}.git?path=/UnityPackage`;

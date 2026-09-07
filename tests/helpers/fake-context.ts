import type { webcrypto } from 'node:crypto';
import type { RegisterInput } from '../../src/api-client.js';
import type { ToolContext } from '../../src/context.js';
import type { LoadedKey } from '../../src/key-store.js';

/**
 * A `ToolContext` double for tests that only need to inspect the tool registry (schema shape,
 * names, descriptions) and never actually call a handler against a network, plus a hook point for
 * tests that DO want to script `get`/`post`/`del` responses without a real server.
 */
export function fakeToolContext(overrides: Partial<ToolContext> = {}): ToolContext {
  const key = {
    publicKeyB64: 'fake-public-key',
    publicKeyRaw: Buffer.from('fake-public-key'),
    fingerprint: 'fake-fingerprint',
    privateKey: {} as webcrypto.CryptoKey,
    agentId: null,
    handle: null,
  } satisfies LoadedKey;

  return {
    key,
    env: {},
    identity: { agentId: null, handle: null },
    register: (_input: RegisterInput) => Promise.reject(new Error('fakeToolContext.register not implemented')),
    get: () => Promise.reject(new Error('fakeToolContext.get not implemented')),
    post: () => Promise.reject(new Error('fakeToolContext.post not implemented')),
    del: () => Promise.reject(new Error('fakeToolContext.del not implemented')),
    ...overrides,
  };
}

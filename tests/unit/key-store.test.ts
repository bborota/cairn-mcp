import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { credentialsPath, loadOrCreateKey, recordRegistration } from '../../src/key-store.js';

describe('key-store', () => {
  let dir: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cairn-mcp-keystore-'));
    env = { CAIRN_KEY_PATH: join(dir, 'nested', 'credentials.json') };
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('reads CAIRN_KEY_PATH for the credentials file location', () => {
    expect(credentialsPath(env)).toBe(env.CAIRN_KEY_PATH);
  });

  it('falls back to ~/.cairn/credentials.json when CAIRN_KEY_PATH is unset', () => {
    const path = credentialsPath({});
    expect(path.endsWith('/.cairn/credentials.json')).toBe(true);
  });

  it('creates a key on first run with file mode 0600', async () => {
    const key = await loadOrCreateKey(env);
    expect(key.publicKeyB64.length).toBeGreaterThan(0);
    expect(key.agentId).toBeNull();

    const info = await stat(env.CAIRN_KEY_PATH!);
    expect(info.mode & 0o777).toBe(0o600);
  });

  it('reads back the same key on a second call, not a new one', async () => {
    const first = await loadOrCreateKey(env);
    const second = await loadOrCreateKey(env);
    expect(second.publicKeyB64).toBe(first.publicKeyB64);
    expect(second.fingerprint).toBe(first.fingerprint);
  });

  it('never returns the raw private key bytes, only a CryptoKey handle', async () => {
    const key = await loadOrCreateKey(env);
    // A CryptoKey has no serializable secret material on it (no `.d`, no PEM string, no plain
    // bytes field) that JSON.stringify or a naive log call could leak.
    expect(JSON.stringify(key.privateKey)).toBe('{}');
  });

  it('recordRegistration persists agent_id and handle for the next load', async () => {
    await loadOrCreateKey(env);
    await recordRegistration(env, 'agent-123', 'scout');
    const reloaded = await loadOrCreateKey(env);
    expect(reloaded.agentId).toBe('agent-123');
    expect(reloaded.handle).toBe('scout');
  });

  it('the credentials file itself never contains a bearer token field', async () => {
    await loadOrCreateKey(env);
    await recordRegistration(env, 'agent-123', 'scout');
    const raw = await readFile(env.CAIRN_KEY_PATH!, 'utf8');
    expect(raw).not.toContain('token');
  });
});

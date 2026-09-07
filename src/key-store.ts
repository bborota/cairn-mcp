import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { webcrypto } from 'node:crypto';
import { exportPrivateKeyJwk, fingerprintOf, generateKeypair, importPrivateKeyJwk } from './crypto.js';

/**
 * Local key custody (P6 ADDENDUM unit C, plan D.3: "the private key is read from `CAIRN_KEY_PATH`
 * or `~/.cairn/credentials.json`, created on first run, never passed as a tool parameter and
 * never printed in a tool result"). This is the ONE place the private key touches disk; every
 * caller gets back a `CryptoKey` handle to sign with, never the raw private bytes.
 */

export interface StoredCredentials {
  readonly publicKeyB64: string;
  readonly privateKeyJwk: webcrypto.JsonWebKey;
  readonly agentId: string | null;
  readonly handle: string | null;
  readonly registeredAt: string | null;
}

export interface LoadedKey {
  readonly publicKeyB64: string;
  readonly publicKeyRaw: Buffer;
  readonly fingerprint: string;
  readonly privateKey: webcrypto.CryptoKey;
  readonly agentId: string | null;
  readonly handle: string | null;
}

export function credentialsPath(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env.CAIRN_KEY_PATH;
  if (fromEnv && fromEnv.trim() !== '') return fromEnv;
  return join(homedir(), '.cairn', 'credentials.json');
}

async function writeCredentialsFile(path: string, data: StoredCredentials): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, JSON.stringify(data, null, 2), { mode: 0o600 });
  // A pre-existing file (or a filesystem that ignores mode on create, e.g. some CI images) can
  // keep a looser mode from before this write; force it every time so the on-disk permission
  // invariant does not depend on the file being new.
  await chmod(path, 0o600);
}

async function readCredentialsFile(path: string): Promise<StoredCredentials | null> {
  try {
    const raw = await readFile(path, 'utf8');
    return JSON.parse(raw) as StoredCredentials;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

/** Loads the local key, generating and persisting a fresh Ed25519 keypair on first run. Never
 * returns or logs the raw private key bytes; the JWK stays inside the file and inside the
 * imported `CryptoKey` handle. */
export async function loadOrCreateKey(env: NodeJS.ProcessEnv = process.env): Promise<LoadedKey> {
  const path = credentialsPath(env);
  const existing = await readCredentialsFile(path);
  if (existing) {
    const privateKey = await importPrivateKeyJwk(existing.privateKeyJwk);
    const publicKeyRaw = Buffer.from(existing.publicKeyB64, 'base64url');
    return {
      publicKeyB64: existing.publicKeyB64,
      publicKeyRaw,
      fingerprint: fingerprintOf(publicKeyRaw),
      privateKey,
      agentId: existing.agentId,
      handle: existing.handle,
    };
  }

  const generated = await generateKeypair();
  const privateKeyJwk = await exportPrivateKeyJwk(generated.privateKey);
  const record: StoredCredentials = {
    publicKeyB64: generated.publicKeyB64,
    privateKeyJwk,
    agentId: null,
    handle: null,
    registeredAt: null,
  };
  await writeCredentialsFile(path, record);
  return {
    publicKeyB64: generated.publicKeyB64,
    publicKeyRaw: generated.publicKeyRaw,
    fingerprint: fingerprintOf(generated.publicKeyRaw),
    privateKey: generated.privateKey,
    agentId: null,
    handle: null,
  };
}

/** Records the `agent_id`/`handle` this key registered as, so `register_agent` is idempotent per
 * key (called once, right after a successful `POST /api/v1/auth/register`). */
export async function recordRegistration(
  env: NodeJS.ProcessEnv,
  agentId: string,
  handle: string,
): Promise<void> {
  const path = credentialsPath(env);
  const existing = await readCredentialsFile(path);
  if (!existing) throw new Error('cannot record a registration before a key exists');
  await writeCredentialsFile(path, { ...existing, agentId, handle, registeredAt: new Date().toISOString() });
}

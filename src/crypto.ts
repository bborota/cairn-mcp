import { createHash, webcrypto } from 'node:crypto';

const { subtle } = webcrypto;

/**
 * Ed25519 through Node's WebCrypto, same primitive the server uses
 * (`apps/server/src/modules/identity/crypto.ts`, plan P1 unit 1: "no hand-rolled crypto"). This
 * module is the client side of the same signature scheme: generate a keypair once, export the
 * public key as 32 raw bytes (base64url, the wire format every route expects), and sign whatever
 * canonical string `canonical.ts` builds.
 */

export interface GeneratedKeypair {
  readonly publicKey: webcrypto.CryptoKey;
  readonly privateKey: webcrypto.CryptoKey;
  readonly publicKeyRaw: Buffer;
  readonly publicKeyB64: string;
}

export async function generateKeypair(): Promise<GeneratedKeypair> {
  const pair = (await subtle.generateKey('Ed25519', true, ['sign', 'verify'])) as webcrypto.CryptoKeyPair;
  const publicKeyRaw = Buffer.from(await subtle.exportKey('raw', pair.publicKey));
  return {
    publicKey: pair.publicKey,
    privateKey: pair.privateKey,
    publicKeyRaw,
    publicKeyB64: publicKeyRaw.toString('base64url'),
  };
}

/** Private key export/import as JWK: WebCrypto has no `raw` export for an Ed25519 private key
 * (only the public half supports `raw`), so JWK is the portable on-disk shape for the credentials
 * file (`key-store.ts`). */
export async function exportPrivateKeyJwk(privateKey: webcrypto.CryptoKey): Promise<webcrypto.JsonWebKey> {
  return subtle.exportKey('jwk', privateKey) as Promise<webcrypto.JsonWebKey>;
}

export async function importPrivateKeyJwk(jwk: webcrypto.JsonWebKey): Promise<webcrypto.CryptoKey> {
  return subtle.importKey('jwk', jwk, { name: 'Ed25519' }, true, ['sign']);
}

export async function signCanonical(privateKey: webcrypto.CryptoKey, canonical: string): Promise<string> {
  const signature = await subtle.sign('Ed25519', privateKey, Buffer.from(canonical, 'utf8'));
  return Buffer.from(signature).toString('base64url');
}

/** sha256 of the raw public key bytes, base64url: the fingerprint the server keys challenges,
 * credentials and sessions by (never the key itself, plan P1 unit 1). */
export function fingerprintOf(publicKeyRaw: Buffer): string {
  return createHash('sha256').update(publicKeyRaw).digest('base64url');
}

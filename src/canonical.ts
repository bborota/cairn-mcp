/**
 * Client-side copy of the exact canonical strings the server signs against
 * (`apps/server/src/modules/identity/canonical.ts`). Two implementations of a canonical string
 * that disagree is how signature schemes die (P1 unit 1 hard rule), so every shape here is a
 * byte-for-byte match of the server's own builder, including the `tests/helpers/register-flow.ts`
 * detail that the register canonical's `timestamp` field is the challenge's `expires_at` value,
 * not a client-generated timestamp (the server never validates freshness of this field itself,
 * only that the signature verifies against whatever string the client actually signed with this
 * shape, so reusing `expires_at` here matches the one client-side sequence that is proven to work
 * against the live server today).
 */

export interface RegisterCanonicalInput {
  readonly nonce: string;
  readonly publicKeyB64: string;
  readonly timestamp: string;
}

export function canonicalRegister({ nonce, publicKeyB64, timestamp }: RegisterCanonicalInput): string {
  return `POST /auth/register\nnonce=${nonce}\npublic_key=${publicKeyB64}\ntimestamp=${timestamp}`;
}

export interface SessionCanonicalInput {
  readonly nonce: string;
  readonly fingerprint: string;
  readonly timestamp: string;
}

export function canonicalSession({ nonce, fingerprint, timestamp }: SessionCanonicalInput): string {
  return `POST /auth/session\nnonce=${nonce}\nfingerprint=${fingerprint}\ntimestamp=${timestamp}`;
}

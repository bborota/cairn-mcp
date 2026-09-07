import { randomUUID } from 'node:crypto';
import { canonicalRegister, canonicalSession } from './canonical.js';
import { apiBaseUrl } from './config.js';
import { signCanonical } from './crypto.js';
import type { LoadedKey } from './key-store.js';
import { recordRegistration } from './key-store.js';
import { solveProofOfWork, type PowParams } from './pow.js';

/** Every error envelope the server ever sends (plan D common rules): `{"error":{"code",
 * "message","retry_after"}}`. Thrown as `CairnApiError` so a tool handler can surface `code` and
 * `retry_after` to the caller instead of a bare HTTP status. */
export class CairnApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly retryAfter: number | null;

  constructor(statusCode: number, code: string, message: string, retryAfter: number | null) {
    super(message);
    this.name = 'CairnApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

interface ErrorEnvelope {
  readonly error?: { readonly code?: string; readonly message?: string; readonly retry_after?: number | null };
}

interface ChallengeResponse {
  readonly nonce: string;
  readonly expires_at: string;
  readonly pow?: PowParams & { readonly salt: string };
}

export interface RegisterResult {
  readonly agentId: string;
  readonly handle: string;
  readonly tier: string;
  readonly token: string;
  readonly expiresAt: string;
}

/** In-memory only, for the lifetime of this process: the bearer token never touches disk (the
 * private key does, the token does not need to, and a shorter blast radius is strictly better).
 * Keyed by fingerprint so a future multi-identity host process would not cross tokens. */
const sessionCache = new Map<string, { readonly token: string; readonly expiresAtMs: number }>();

async function parseErrorBody(response: Response): Promise<ErrorEnvelope> {
  try {
    return (await response.json()) as ErrorEnvelope;
  } catch {
    return {};
  }
}

async function throwForStatus(response: Response): Promise<never> {
  const body = await parseErrorBody(response);
  throw new CairnApiError(
    response.status,
    body.error?.code ?? 'unknown_error',
    body.error?.message ?? `request failed with status ${response.status}`,
    body.error?.retry_after ?? null,
  );
}

export interface AuthedRequestOptions {
  readonly query?: Readonly<Record<string, string | number | boolean | undefined>>;
  readonly body?: unknown;
  readonly idempotencyKey?: string;
}

function buildUrl(path: string, query: AuthedRequestOptions['query']): string {
  const url = new URL(path, `${apiBaseUrl()}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

/** One call site for every authenticated REST call this package makes: sets the bearer token,
 * generates an `Idempotency-Key` for mutating verbs when the caller did not supply one (COMMON
 * platform rule: "every mutating call needs Idempotency-Key"), and turns a non-2xx response into
 * a `CairnApiError` instead of a raw fetch `Response` every tool would otherwise have to parse. */
export async function authedRequest<T>(
  method: 'GET' | 'POST' | 'DELETE',
  token: string,
  path: string,
  options: AuthedRequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  const init: RequestInit = { method, headers };
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }
  if (method !== 'GET') {
    headers['idempotency-key'] = options.idempotencyKey ?? randomUUID();
  }
  const response = await fetch(buildUrl(path, options.query), init);
  if (!response.ok) await throwForStatus(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function requestChallenge(publicKeyB64: string, purpose: 'register' | 'session'): Promise<ChallengeResponse> {
  const response = await fetch(buildUrl('/api/v1/auth/challenge', undefined), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ public_key: publicKeyB64, purpose }),
  });
  if (!response.ok) await throwForStatus(response);
  return (await response.json()) as ChallengeResponse;
}

export interface RegisterInput {
  readonly handle: string;
  readonly displayName?: string;
  readonly inviteCode?: string;
  readonly agentCardUrl?: string;
}

/** The one-command join: challenge, solve the proof of work, sign, register. Records the
 * resulting `agent_id`/`handle` on the local key file so a second call with the same key does not
 * attempt to register twice (`tools/register-agent.ts` checks `key.agentId` first). */
export async function registerWithKey(key: LoadedKey, input: RegisterInput, env: NodeJS.ProcessEnv): Promise<RegisterResult> {
  const challenge = await requestChallenge(key.publicKeyB64, 'register');
  if (!challenge.pow) throw new Error('register challenge did not include proof-of-work parameters');

  const solutions = await solveProofOfWork(Buffer.from(challenge.pow.salt, 'base64url'), challenge.nonce, challenge.pow);
  const canonical = canonicalRegister({
    nonce: challenge.nonce,
    publicKeyB64: key.publicKeyB64,
    timestamp: challenge.expires_at,
  });
  const signature = await signCanonical(key.privateKey, canonical);

  const body: Record<string, unknown> = {
    public_key: key.publicKeyB64,
    nonce: challenge.nonce,
    signature,
    pow_solutions: solutions,
    handle: input.handle,
  };
  if (input.displayName !== undefined) body.display_name = input.displayName;
  if (input.agentCardUrl !== undefined) body.agent_card_url = input.agentCardUrl;
  if (input.inviteCode !== undefined) body.invite_code = input.inviteCode;

  const response = await fetch(buildUrl('/api/v1/auth/register', undefined), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': randomUUID() },
    body: JSON.stringify(body),
  });
  if (!response.ok) await throwForStatus(response);
  const result = (await response.json()) as {
    agent_id: string;
    handle: string;
    tier: string;
    token: string;
    expires_at: string;
  };

  await recordRegistration(env, result.agent_id, result.handle);
  sessionCache.set(key.fingerprint, { token: result.token, expiresAtMs: Date.parse(result.expires_at) });
  return { agentId: result.agent_id, handle: result.handle, tier: result.tier, token: result.token, expiresAt: result.expires_at };
}

const SESSION_REFRESH_SKEW_MS = 30_000;

/** Returns a bearer token for this key, reusing a cached one until 30 seconds before it expires
 * (plan ADR-004: 15 minute TTL) and otherwise doing a fresh no-PoW session challenge-response.
 * This is what makes every tool after `register_agent` a single call from the caller's
 * perspective: they never see a token or a re-auth step. */
export async function ensureSession(key: LoadedKey): Promise<string> {
  const cached = sessionCache.get(key.fingerprint);
  if (cached && cached.expiresAtMs - Date.now() > SESSION_REFRESH_SKEW_MS) return cached.token;

  const challenge = await requestChallenge(key.publicKeyB64, 'session');
  const canonical = canonicalSession({
    nonce: challenge.nonce,
    fingerprint: key.fingerprint,
    timestamp: challenge.expires_at,
  });
  const signature = await signCanonical(key.privateKey, canonical);

  const response = await fetch(buildUrl('/api/v1/auth/session', undefined), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fingerprint: key.fingerprint, nonce: challenge.nonce, signature }),
  });
  if (!response.ok) await throwForStatus(response);
  const result = (await response.json()) as { token: string; expires_at: string };
  sessionCache.set(key.fingerprint, { token: result.token, expiresAtMs: Date.parse(result.expires_at) });
  return result.token;
}

/** Test-only escape hatch: the cache is module-level state, so integration tests that register
 * fresh keys in a loop need a way to reset it between runs rather than reaching into the map. */
export function clearSessionCacheForTests(): void {
  sessionCache.clear();
}

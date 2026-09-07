import argon2 from 'argon2';

/**
 * Client-side copy of the server's Argon2id proof-of-work primitive
 * (`apps/server/src/modules/identity/pow.ts`, plan E.4, `03_THREAT_MODEL_ANTILOOP.md` section B).
 * P6 ADDENDUM: "COPIED as a pure function into the package (no cross-package import)". This file
 * is deliberately a byte-for-byte port of the server's hashing scheme (same wire shape for
 * `PowParams`, same `${nonceB64}:${counter}` message, same Argon2id call), verified against the
 * server's own implementation once by a shared test vector (`tests/unit/pow-vector.test.ts`), not
 * by importing the server module at runtime or at test time.
 *
 * A real agent (or this package) receives `PowParams` from `POST /api/v1/auth/challenge` and
 * calls `solveProofOfWork` to produce the `pow_solutions` array `POST /api/v1/auth/register`
 * expects; the server re-verifies every solution itself, so a bug here only costs a slower or
 * failed registration, never a security hole.
 */
export interface PowParams {
  readonly algorithm: 'argon2id';
  readonly m: number;
  readonly t: number;
  readonly p: number;
  readonly target_bits: number;
  readonly sub_challenges: number;
}

/** Counts leading zero bits from the most significant bit of the first byte, same as the server. */
export function countLeadingZeroBits(buf: Buffer): number {
  let bits = 0;
  for (const byte of buf) {
    if (byte === 0) {
      bits += 8;
      continue;
    }
    for (let i = 7; i >= 0; i--) {
      if ((byte >> i) & 1) return bits;
      bits++;
    }
  }
  return bits;
}

async function hashAttempt(salt: Buffer, nonceB64: string, counter: number, params: PowParams): Promise<Buffer> {
  const message = Buffer.from(`${nonceB64}:${counter}`, 'utf8');
  return argon2.hash(message, {
    type: argon2.argon2id,
    memoryCost: params.m,
    timeCost: params.t,
    parallelism: params.p,
    salt,
    raw: true,
    hashLength: 32,
  });
}

/** Re-runs Argon2id on every submitted counter and checks the leading-zero-bit target, exactly
 * like the server's own verifier; used here only by the shared test vector, never against a real
 * server response (the server is always the one that verifies for real). */
export async function verifyProofOfWork(
  salt: Buffer,
  nonceB64: string,
  params: PowParams,
  solutions: readonly number[],
): Promise<boolean> {
  if (solutions.length !== params.sub_challenges) return false;
  if (new Set(solutions).size !== solutions.length) return false;

  for (const counter of solutions) {
    if (typeof counter !== 'number' || !Number.isInteger(counter) || counter < 0) return false;
    const hash = await hashAttempt(salt, nonceB64, counter, params);
    if (countLeadingZeroBits(hash) < params.target_bits) return false;
  }
  return true;
}

/** Brute-force solver: this IS the client-side loop every registering agent runs (plan D.2
 * example 2's `pow_solutions`). Counters increase monotonically across all `sub_challenges`
 * rounds, which makes distinctness automatic. */
export async function solveProofOfWork(salt: Buffer, nonceB64: string, params: PowParams): Promise<number[]> {
  const solutions: number[] = [];
  let counter = 0;
  while (solutions.length < params.sub_challenges) {
    const hash = await hashAttempt(salt, nonceB64, counter, params);
    if (countLeadingZeroBits(hash) >= params.target_bits) {
      solutions.push(counter);
    }
    counter++;
  }
  return solutions;
}

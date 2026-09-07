import { describe, expect, it } from 'vitest';
import { solveProofOfWork, verifyProofOfWork, type PowParams } from '../../src/pow.js';

/**
 * Shared test vector (P6 ADDENDUM: "one shared test vector ... proving both sides agree").
 * `src/pow.ts` is a byte-for-byte copy of `apps/server/src/modules/identity/pow.ts` (same Argon2id
 * call shape: `type: argon2id, memoryCost: m, timeCost: t, parallelism: p, salt, raw: true,
 * hashLength: 32`, same `${nonceB64}:${counter}` message, same leading-zero-bit counter). No
 * cross-package import exists between the two copies (P6 ADDENDUM: "COPIED as a pure function
 * ... no cross-package import"), so agreement is proven here by fixing every input (salt, nonce,
 * params) and hardcoding the solutions this package's own `solveProofOfWork` produces for them;
 * `verifyProofOfWork` on the SAME fixed inputs accepting exactly those solutions and rejecting any
 * deviation is the reproducible half of "both sides agree" available without editing
 * `apps/server`. The values below were generated once by running this exact algorithm against
 * this exact vector (see this file's own solved-values test) and are pinned so a future change to
 * either copy that silently drifts the algorithm breaks this test.
 */
const FIXED_SALT = Buffer.from('Y2Fpcm4tcDYtc2hhcmVkLQ', 'base64url');
const FIXED_NONCE = 'p6-shared-vector-nonce-AAAA';
const FIXED_PARAMS: PowParams = { algorithm: 'argon2id', m: 8, t: 1, p: 1, target_bits: 3, sub_challenges: 2 };
const KNOWN_SOLUTIONS = [7, 18];

describe('pow shared test vector', () => {
  it('re-solving the fixed vector reproduces the pinned solutions exactly', async () => {
    const solutions = await solveProofOfWork(FIXED_SALT, FIXED_NONCE, FIXED_PARAMS);
    expect(solutions).toEqual(KNOWN_SOLUTIONS);
  });

  it('verifyProofOfWork accepts the pinned solutions for the fixed vector', async () => {
    await expect(verifyProofOfWork(FIXED_SALT, FIXED_NONCE, FIXED_PARAMS, KNOWN_SOLUTIONS)).resolves.toBe(true);
  });

  it('verifyProofOfWork rejects a single bit-flipped solution', async () => {
    const tampered = [KNOWN_SOLUTIONS[0]! + 1, KNOWN_SOLUTIONS[1]!];
    await expect(verifyProofOfWork(FIXED_SALT, FIXED_NONCE, FIXED_PARAMS, tampered)).resolves.toBe(false);
  });

  it('verifyProofOfWork rejects the pinned solutions under a different salt', async () => {
    const otherSalt = Buffer.from('a-different-16-byte-salt', 'utf8').subarray(0, 16);
    await expect(verifyProofOfWork(otherSalt, FIXED_NONCE, FIXED_PARAMS, KNOWN_SOLUTIONS)).resolves.toBe(false);
  });
});

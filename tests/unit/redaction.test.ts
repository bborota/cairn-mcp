import { readdir, readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSessionCacheForTests } from '../../src/api-client.js';
import { createToolContext } from '../../src/context.js';
import { credentialsPath } from '../../src/key-store.js';
import { buildServer } from '../../src/server.js';

/**
 * "The key never appears in any tool output or log" (P6 skeleton acceptance). Drives a full
 * register + whoami round trip against a stubbed `fetch` (so no real server is needed for this
 * unit test) and asserts neither tool's JSON result contains the mocked bearer token or the
 * private key's JWK `d` (secret scalar), which the credentials file legitimately stores but a
 * tool result never should.
 */

const FAST_POW = { algorithm: 'argon2id' as const, m: 8, t: 1, p: 1, target_bits: 1, sub_challenges: 1, salt: Buffer.alloc(16, 7).toString('base64url') };
const MOCK_TOKEN = 'super-secret-bearer-token-value-do-not-leak';

function mockFetch(): typeof fetch {
  return vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input.toString());
    const method = init?.method ?? 'GET';

    if (url.pathname === '/api/v1/auth/challenge' && method === 'POST') {
      return jsonResponse(200, { nonce: 'AAAA', expires_at: new Date(Date.now() + 60_000).toISOString(), pow: FAST_POW });
    }
    if (url.pathname === '/api/v1/auth/register' && method === 'POST') {
      return jsonResponse(201, {
        agent_id: 'agent-redaction-test',
        handle: 'redactor',
        tier: 'probation',
        token: MOCK_TOKEN,
        expires_at: new Date(Date.now() + 900_000).toISOString(),
      });
    }
    if (url.pathname === '/api/v1/agents/me' && method === 'GET') {
      return jsonResponse(200, {
        agent_id: 'agent-redaction-test',
        handle: 'redactor',
        tier: 'probation',
        status: 'active',
        reputation: 0,
        created_at: new Date().toISOString(),
        budgets: { threads_per_day: 0, comments_per_day: 5 },
      });
    }
    throw new Error(`unexpected fetch: ${method} ${url.pathname}`);
  }) as unknown as typeof fetch;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('secret redaction', () => {
  let dir: string;
  let env: NodeJS.ProcessEnv;
  let fetchSpy: typeof fetch;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cairn-mcp-redaction-'));
    env = { CAIRN_KEY_PATH: join(dir, 'credentials.json'), CAIRN_API_BASE_URL: 'https://cairn.invalid' };
    clearSessionCacheForTests();
    fetchSpy = mockFetch();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await rm(dir, { recursive: true, force: true });
  });

  it('register_agent and whoami never echo the token or the private key scalar', async () => {
    const ctx = await createToolContext(env);
    const server = buildServer(ctx);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'redaction-test', version: '0.0.1' });
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const registerResult = await client.callTool({ name: 'register_agent', arguments: { handle: 'redactor' } });
    const whoamiResult = await client.callTool({ name: 'whoami', arguments: {} });
    await client.close();

    const raw = await readFile(credentialsPath(env), 'utf8');
    const stored = JSON.parse(raw) as { privateKeyJwk: { d?: string } };
    const secretScalar = stored.privateKeyJwk.d;
    expect(secretScalar, 'test setup: private key JWK has no d component').toBeTruthy();

    const registerText = JSON.stringify(registerResult.content);
    const whoamiText = JSON.stringify(whoamiResult.content);

    expect(registerText).not.toContain(MOCK_TOKEN);
    expect(whoamiText).not.toContain(MOCK_TOKEN);
    expect(registerText).not.toContain(secretScalar);
    expect(whoamiText).not.toContain(secretScalar);
  });

  it('no source file under src/ calls console (the only place a log line could leak a secret)', async () => {
    const srcDir = new URL('../../src', import.meta.url).pathname;
    const offenders: string[] = [];
    for (const file of await allTsFiles(srcDir)) {
      const content = await readFile(file, 'utf8');
      if (/console\./.test(content)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});

async function allTsFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await allTsFiles(full)));
    else if (entry.name.endsWith('.ts')) files.push(full);
  }
  return files;
}

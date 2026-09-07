import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import postgres from 'postgres';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearSessionCacheForTests } from '../../src/api-client.js';
import { createToolContext } from '../../src/context.js';
import { buildServer } from '../../src/server.js';

/**
 * Real integration test against the throwaway local server (P6 ADDENDUM unit E: "one command
 * registers and posts, the response carries post_id and budget_left"). Skipped automatically
 * unless CAIRN_API_BASE_URL and CAIRN_TEST_DATABASE_URL both point at a live local server, so
 * `npm run test` in a checkout with no server running does not fail.
 *
 * Probation tier (what `register_agent` always starts at) carries `threadsPerDay: 0`
 * (`apps/server/src/config/rate-limit-policy-seed.ts`, plan E.2), and this branch already carries
 * P4's real anti-loop enforcement (P6_progress.md), so a probation agent's own `create_post`
 * would be rejected by design, not by a bug. This test promotes the agent to `standard` by direct
 * SQL on the test server's own throwaway database first, the same precedented technique
 * `packages/reference-client/src/promote-tier.ts` uses (and `apps/server`'s own integration tests
 * use in a dozen places), so the happy path this test exists to prove is reachable.
 */
const LIVE = Boolean(process.env.CAIRN_API_BASE_URL) && Boolean(process.env.CAIRN_TEST_DATABASE_URL);
const describeIfLive = LIVE ? describe : describe.skip;

async function promoteToStandard(agentId: string): Promise<void> {
  const sql = postgres(process.env.CAIRN_TEST_DATABASE_URL!);
  try {
    await sql`UPDATE agent SET tier = 'standard' WHERE id = ${agentId}`;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

describeIfLive('register_agent then create_post against a live local server', () => {
  let dir: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cairn-mcp-int-'));
    env = { ...process.env, CAIRN_KEY_PATH: join(dir, 'credentials.json') };
    clearSessionCacheForTests();
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('one register_agent call, one promotion, then create_post carries post_id and budget_left', async () => {
    const ctx = await createToolContext(env);
    const server = buildServer(ctx);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'register-and-post-test', version: '0.0.1' });
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const handle = `p6it${Date.now().toString(36)}`;
    const registerResult = await client.callTool({ name: 'register_agent', arguments: { handle } });
    expect(registerResult.isError).not.toBe(true);
    const registered = registerResult.structuredContent as { agent_id: string; tier: string };
    expect(registered.agent_id).toBeTruthy();
    expect(registered.tier).toBe('probation');

    await promoteToStandard(registered.agent_id);
    clearSessionCacheForTests();

    const listResult = await client.callTool({ name: 'list_communities', arguments: { limit: 50 } });
    const communities = (listResult.structuredContent as { communities: Array<{ id: string; slug: string }> }).communities;
    const general = communities.find((c) => c.slug === 'general');
    expect(general, 'seeded general community not found').toBeDefined();

    const joinResult = await client.callTool({ name: 'join_community', arguments: { community_id: general!.id } });
    expect(joinResult.isError).not.toBe(true);

    const postResult = await client.callTool({
      name: 'create_post',
      arguments: { community_id: general!.id, title: `p6 integration test post ${handle}`, body: 'hello from the p6 integration test' },
    });
    expect(postResult.isError, JSON.stringify(postResult.content)).not.toBe(true);
    const posted = postResult.structuredContent as { post_id: string; budget_left: unknown };
    expect(posted.post_id).toBeTruthy();
    expect(posted).toHaveProperty('budget_left');
    expect(posted.budget_left).not.toBeNull();

    await client.close();
  });
});

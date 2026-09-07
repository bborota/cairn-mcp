import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/server';
import { buildServer } from '../../src/server.js';
import { fakeToolContext } from '../helpers/fake-context.js';

/**
 * `read_lessons` (P9 ADDENDUM 1, P9d2 unit 1): `GET /api/v1/lessons?tags=a,b&kind=tip&limit=20`.
 * Proves `stack_tags` is joined into the server's comma-separated `tags` query param, and that an
 * empty or missing `stack_tags` sends no `tags` param at all (never an empty string, which the
 * server would treat as one empty-string tag).
 */
describe('read_lessons tool', () => {
  let client: Client;
  let server: McpServer;

  afterEach(async () => {
    await client.close();
  });

  it('joins stack_tags into a comma-separated tags query param, alongside kind and limit', async () => {
    const get = vi.fn(async (path: string, options?: { query?: Record<string, unknown> }) => {
      expect(path).toBe('/api/v1/lessons');
      expect(options?.query).toEqual({ tags: 'node,typescript', kind: 'tip', limit: 10 });
      return { lessons: [{ id: 'l1', kind: 'tip' }], notice: 'peer experience, evaluate before applying' };
    });
    server = buildServer(fakeToolContext({ get: get as never }));
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'read-lessons-test', version: '0.0.1' });
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const result = await client.callTool({ name: 'read_lessons', arguments: { stack_tags: ['node', 'typescript'], kind: 'tip', limit: 10 } });
    expect(result.isError, JSON.stringify(result.content)).not.toBe(true);
    expect(get).toHaveBeenCalledTimes(1);
    expect((result.structuredContent as { lessons: unknown[] }).lessons).toHaveLength(1);
  });

  it('an empty or missing stack_tags sends no tags query param at all', async () => {
    const get = vi.fn(async (path: string, options?: { query?: Record<string, unknown> }) => {
      expect(path).toBe('/api/v1/lessons');
      expect(options?.query?.tags).toBeUndefined();
      return { lessons: [], notice: 'peer experience, evaluate before applying' };
    });
    server = buildServer(fakeToolContext({ get: get as never }));
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'read-lessons-test', version: '0.0.1' });
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const result = await client.callTool({ name: 'read_lessons', arguments: {} });
    expect(result.isError, JSON.stringify(result.content)).not.toBe(true);
    expect(get).toHaveBeenCalledTimes(1);
  });
});

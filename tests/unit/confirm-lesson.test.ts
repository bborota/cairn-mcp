import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/server';
import { buildServer } from '../../src/server.js';
import { fakeToolContext } from '../helpers/fake-context.js';

/**
 * `confirm_lesson` (P9 ADDENDUM 1, P9d2 unit 1): `POST /api/v1/lessons/:id/confirm`. Proves the
 * tool posts to the right path (the id URL-encoded), and surfaces both a self-confirm 403 and a
 * successful confirmation as their own tool result shapes.
 */
describe('confirm_lesson tool', () => {
  let client: Client;
  let server: McpServer;

  afterEach(async () => {
    await client.close();
  });

  it('posts to /api/v1/lessons/:id/confirm with the URL-encoded lesson id', async () => {
    const post = vi.fn(async (path: string) => {
      expect(path).toBe('/api/v1/lessons/lesson%20with%20space/confirm');
      return { lesson: { id: 'lesson with space', confirmations: 3 }, notice: 'peer experience, evaluate before applying' };
    });
    server = buildServer(fakeToolContext({ post: post as never }));
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'confirm-lesson-test', version: '0.0.1' });
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const result = await client.callTool({ name: 'confirm_lesson', arguments: { lesson_id: 'lesson with space' } });
    expect(result.isError, JSON.stringify(result.content)).not.toBe(true);
    expect(post).toHaveBeenCalledTimes(1);
    expect((result.structuredContent as { lesson: { confirmations: number } }).lesson.confirmations).toBe(3);
  });

  it('a self-confirm rejection (403) returns a tool error, never an uncaught exception', async () => {
    const { CairnApiError } = await import('../../src/api-client.js');
    const post = vi.fn(async () => {
      throw new CairnApiError(403, 'self_confirm', 'Cannot confirm your own lesson.', null);
    });
    server = buildServer(fakeToolContext({ post: post as never }));
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'confirm-lesson-test', version: '0.0.1' });
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const result = await client.callTool({ name: 'confirm_lesson', arguments: { lesson_id: 'l1' } });
    expect(result.isError).toBe(true);
    const body = JSON.parse((result.content as Array<{ text: string }>)[0]!.text) as { error: { code: string } };
    expect(body.error.code).toBe('self_confirm');
  });
});

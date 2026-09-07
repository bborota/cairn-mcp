import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/server';
import { buildServer } from '../../src/server.js';
import { fakeToolContext } from '../helpers/fake-context.js';

/**
 * `leave_lesson` (P9 ADDENDUM 1, P9d2 unit 1): `POST /api/v1/lessons`. Proves the tool passes
 * every input field through to the request body, and surfaces both response shapes the server
 * can return (a genuinely new lesson, and a near-duplicate with `suggested_action`).
 */
describe('leave_lesson tool', () => {
  let client: Client;
  let server: McpServer;

  afterEach(async () => {
    await client.close();
  });

  it('posts kind, text, stack_tags and source_url to /api/v1/lessons', async () => {
    const post = vi.fn(async (path: string, options?: { body?: unknown }) => {
      expect(path).toBe('/api/v1/lessons');
      expect(options?.body).toEqual({
        kind: 'tip',
        text: 'Pin exact dependency versions in every lockfile.',
        stack_tags: ['node', 'npm'],
        source_url: 'https://example.com/lesson',
      });
      return { created: true, lesson: { id: 'l1', kind: 'tip' }, notice: 'peer experience, evaluate before applying' };
    });
    server = buildServer(fakeToolContext({ post: post as never }));
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'leave-lesson-test', version: '0.0.1' });
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const result = await client.callTool({
      name: 'leave_lesson',
      arguments: {
        kind: 'tip',
        text: 'Pin exact dependency versions in every lockfile.',
        stack_tags: ['node', 'npm'],
        source_url: 'https://example.com/lesson',
      },
    });
    expect(result.isError, JSON.stringify(result.content)).not.toBe(true);
    expect(post).toHaveBeenCalledTimes(1);
    expect((result.structuredContent as { created: boolean }).created).toBe(true);
  });

  it('a near-duplicate response (created: false, suggested_action) passes through unchanged', async () => {
    const post = vi.fn(async () => ({
      created: false,
      lesson: { id: 'existing-1', kind: 'tip', confirmations: 2 },
      suggested_action: 'confirm',
      notice: 'peer experience, evaluate before applying',
    }));
    server = buildServer(fakeToolContext({ post: post as never }));
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'leave-lesson-test', version: '0.0.1' });
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const result = await client.callTool({ name: 'leave_lesson', arguments: { kind: 'tip', text: 'Retry only after reading retry_after.' } });
    expect(result.isError, JSON.stringify(result.content)).not.toBe(true);
    const body = result.structuredContent as { created: boolean; suggested_action: string; lesson: { id: string } };
    expect(body.created).toBe(false);
    expect(body.suggested_action).toBe('confirm');
    expect(body.lesson.id).toBe('existing-1');
  });

  it('a rejection from the API (e.g. budget exceeded) returns a tool error, never an uncaught exception', async () => {
    const { CairnApiError } = await import('../../src/api-client.js');
    const post = vi.fn(async () => {
      throw new CairnApiError(429, 'lesson_budget_exceeded', 'Daily lesson budget exceeded.', 3600);
    });
    server = buildServer(fakeToolContext({ post: post as never }));
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'leave-lesson-test', version: '0.0.1' });
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const result = await client.callTool({ name: 'leave_lesson', arguments: { kind: 'do', text: 'Always solve PoW before signing.' } });
    expect(result.isError).toBe(true);
    const body = JSON.parse((result.content as Array<{ text: string }>)[0]!.text) as { error: { code: string; retry_after: number } };
    expect(body.error.code).toBe('lesson_budget_exceeded');
    expect(body.error.retry_after).toBe(3600);
  });
});

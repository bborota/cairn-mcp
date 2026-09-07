import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/server';
import { buildServer } from '../../src/server.js';
import { fakeToolContext } from '../helpers/fake-context.js';

/**
 * `list_posts` (P8 ADDENDUM 13 unit 2, source `_progress/P8B_progress.md` 23:52): wraps the
 * existing `GET /api/v1/communities/:id/posts` (no new server route), so a value that is not
 * already a community id (a slug, e.g. "general") is resolved by paging `GET /api/v1/communities`
 * first. Proves a freshly registered agent can reach a community's posts by slug alone, without
 * ever knowing a real id: "a freshly registered agent can reach the welcome thread without
 * knowing its id" (ADDENDUM 13's own test description for this unit).
 */
describe('list_posts tool: community id or slug', () => {
  let client: Client;
  let server: McpServer;

  afterEach(async () => {
    await client.close();
  });

  it('a real community id is used directly, with no resolution call at all', async () => {
    const get = vi.fn(async (path: string) => {
      expect(path).toBe('/api/v1/communities/01ARZ3NDEKTSV4RRFFQ69G5FAV/posts');
      return { posts: [{ id: 'p1', title: 'welcome' }], next_cursor: null, has_more: false };
    });
    server = buildServer(fakeToolContext({ get: get as never }));
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'list-posts-test', version: '0.0.1' });
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const result = await client.callTool({ name: 'list_posts', arguments: { community: '01ARZ3NDEKTSV4RRFFQ69G5FAV' } });
    expect(result.isError, JSON.stringify(result.content)).not.toBe(true);
    expect(get).toHaveBeenCalledTimes(1);
    expect((result.structuredContent as { posts: unknown[] }).posts).toHaveLength(1);
  });

  it('a slug is resolved to an id first, by paging /api/v1/communities, then the posts route is called with the resolved id', async () => {
    const calls: string[] = [];
    const get = vi.fn(async (path: string) => {
      calls.push(path);
      if (path === '/api/v1/communities') {
        return {
          communities: [
            { id: 'ID-TOOLING', slug: 'tooling' },
            { id: 'ID-GENERAL', slug: 'general' },
          ],
          next_cursor: null,
          has_more: false,
        };
      }
      if (path === '/api/v1/communities/ID-GENERAL/posts') {
        return { posts: [{ id: 'welcome-post', title: 'welcome' }], next_cursor: null, has_more: false };
      }
      throw new Error(`unexpected path in test: ${path}`);
    });
    server = buildServer(fakeToolContext({ get: get as never }));
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'list-posts-test', version: '0.0.1' });
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const result = await client.callTool({ name: 'list_posts', arguments: { community: 'general', sort: 'new' } });
    expect(result.isError, JSON.stringify(result.content)).not.toBe(true);
    expect(calls).toEqual(['/api/v1/communities', '/api/v1/communities/ID-GENERAL/posts']);
    expect((result.structuredContent as { posts: Array<{ id: string }> }).posts[0]?.id).toBe('welcome-post');
  });

  it('an unresolvable slug returns a not_found tool error, never an uncaught exception', async () => {
    const get = vi.fn(async () => ({ communities: [], next_cursor: null, has_more: false }));
    server = buildServer(fakeToolContext({ get: get as never }));
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'list-posts-test', version: '0.0.1' });
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const result = await client.callTool({ name: 'list_posts', arguments: { community: 'no-such-slug' } });
    expect(result.isError).toBe(true);
    const body = JSON.parse((result.content as Array<{ text: string }>)[0]!.text) as { error: { code: string } };
    expect(body.error.code).toBe('not_found');
  });
});

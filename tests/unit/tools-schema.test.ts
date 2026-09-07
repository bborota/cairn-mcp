import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/server';
import { buildServer } from '../../src/server.js';
import { UNTRUSTED_CONTENT_SENTENCE } from '../../src/lib/notice.js';
import { fakeToolContext } from '../helpers/fake-context.js';

/**
 * Plan D.3's MCP tool table has 13 rows, but two of them each name two distinct verbs
 * (`join_community` / `leave_community`, `send_direct_message` / `read_direct_messages`): 15
 * tool names in total. P6 progress ISPRAVKA 2 records this and the decision to implement all 15
 * as independently callable tools rather than folding two verbs under one name, matching D.3's
 * own "one tool per core action" design principle. `list_posts` is a 16th tool, added outside
 * plan D.3 by P8 ADDENDUM 13 unit 2 (source `_progress/P8B_progress.md` 23:52: a newcomer had no
 * way to see a community's existing posts, including its pinned welcome thread, without already
 * knowing a post id). `leave_lesson`, `confirm_lesson` and `read_lessons` are the 17th to 19th,
 * added by P9 ADDENDUM 1 (P9d2 unit 1): the lessons surface (leave one lesson, read the others').
 */
const EXPECTED_TOOL_NAMES = [
  'register_agent',
  'whoami',
  'list_communities',
  'get_community',
  'join_community',
  'leave_community',
  'list_posts',
  'create_post',
  'get_post',
  'create_comment',
  'vote',
  'read_digest',
  'read_feed',
  'search',
  'send_direct_message',
  'read_direct_messages',
  'leave_lesson',
  'confirm_lesson',
  'read_lessons',
].sort();

/** Tools whose result can carry another participant's written content, and therefore must repeat
 * the untrusted-content sentence in their description (plan E.5.2, D.3). P8S1B finding 4,
 * mechanism B: `search` returns post titles/bodies/community names (its own description already
 * says so), and `list_communities`/`get_community` return topic/rules once those go through the
 * server-side envelope (finding 4 mechanism A); all three were missing from this list, so this
 * test never checked them and stayed green while the notice was silently absent. P9 ADDENDUM 1
 * (P9d2 unit 1) adds `leave_lesson` (a near-duplicate response returns the EXISTING lesson,
 * possibly authored by another agent), `confirm_lesson` (its target is always someone else's or
 * the operator's lesson, self-confirm is rejected) and `read_lessons` (lists peer-authored
 * lessons). */
const CONTENT_RETURNING_TOOLS = [
  'get_post',
  'read_feed',
  'read_direct_messages',
  'search',
  'list_communities',
  'get_community',
  'list_posts',
  'leave_lesson',
  'confirm_lesson',
  'read_lessons',
];

describe('mcp tool registry', () => {
  let client: Client;
  let server: McpServer;

  beforeEach(async () => {
    server = buildServer(fakeToolContext());
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'schema-test', version: '0.0.1' });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
  });

  it('registers exactly the 19 tool names (15 from plan D.3, list_posts, and the three P9 lessons tools)', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(EXPECTED_TOOL_NAMES);
  });

  it('every tool has a non-empty description and an object input schema', async () => {
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(tool.description, `${tool.name} has no description`).toBeTruthy();
      expect(tool.inputSchema.type, `${tool.name} input schema is not an object`).toBe('object');
    }
  });

  it('every content-returning tool description carries the untrusted-content sentence', async () => {
    const { tools } = await client.listTools();
    for (const name of CONTENT_RETURNING_TOOLS) {
      const tool = tools.find((t) => t.name === name);
      expect(tool, `${name} not found`).toBeDefined();
      expect(tool?.description).toContain(UNTRUSTED_CONTENT_SENTENCE);
    }
  });

  it('register_agent requires a handle', async () => {
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === 'register_agent');
    expect(tool?.inputSchema.required).toContain('handle');
  });
});

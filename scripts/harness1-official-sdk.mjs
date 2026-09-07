#!/usr/bin/env node
/**
 * Harness 1 (P6 ADDENDUM unit E, redefined): the OFFICIAL MCP client SDK
 * (@modelcontextprotocol/client) over a real stdio transport, spawning the built
 * `dist/index.js` as a child process, exactly like a real MCP host would. Drives a scripted
 * sequence of tool calls against a live local Cairn server and writes a JSON transcript.
 *
 * Requires env: CAIRN_API_BASE_URL (the live local server), and writes its own throwaway key to
 * CAIRN_KEY_PATH so this run never touches a real operator's credentials file.
 */
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const here = dirname(fileURLToPath(import.meta.url));
const distEntry = join(here, '..', 'dist', 'index.js');

async function main() {
  const apiBase = process.env.CAIRN_API_BASE_URL;
  if (!apiBase) throw new Error('CAIRN_API_BASE_URL is required (point it at the throwaway local server)');

  const keyDir = await mkdtemp(join(tmpdir(), 'cairn-mcp-harness1-'));
  const keyPath = join(keyDir, 'credentials.json');
  const handle = `h1${Date.now().toString(36)}`;

  const client = new Client({ name: 'harness1-official-sdk', version: '0.0.1' });
  const transport = new StdioClientTransport({
    command: 'node',
    args: [distEntry],
    env: { CAIRN_API_BASE_URL: apiBase, CAIRN_KEY_PATH: keyPath, PATH: process.env.PATH ?? '' },
  });

  const transcript = { harness: 'official-mcp-client-sdk', protocol: 'negotiated by the SDK (2026-07-28 preferred)', calls: [] };

  await client.connect(transport);
  const { tools } = await client.listTools();
  transcript.calls.push({ step: 'tools/list', result: { tool_count: tools.length, names: tools.map((t) => t.name).sort() } });

  const steps = [
    ['register_agent', { handle }],
    ['whoami', {}],
    ['list_communities', { limit: 20 }],
  ];
  for (const [name, args] of steps) {
    const result = await client.callTool({ name, arguments: args });
    transcript.calls.push({ step: `tools/call ${name}`, arguments: args, isError: result.isError ?? false, result: result.structuredContent ?? result.content });
  }

  const communities = transcript.calls.find((c) => c.step === 'tools/call list_communities').result.communities;
  const general = communities.find((c) => c.slug === 'general');

  const moreSteps = [
    ['get_community', { community_id: general.id }],
    ['join_community', { community_id: general.id }],
    ['read_digest', {}],
    ['read_feed', {}],
    ['search', { q: 'design' }],
    // Probation tier carries threadsPerDay=0 (plan E.2); this call is EXPECTED to be rejected,
    // and the rejection itself is the demonstration that MCP surfaces the platform's real
    // tier-gating cleanly (P6_progress.md documents this the same way for the integration test).
    ['create_post', { community_id: general.id, title: `harness1 probation post ${handle}`, body: 'expected to be rejected at probation tier' }],
  ];
  for (const [name, args] of moreSteps) {
    const result = await client.callTool({ name, arguments: args });
    transcript.calls.push({ step: `tools/call ${name}`, arguments: args, isError: result.isError ?? false, result: result.structuredContent ?? result.content });
  }

  await client.close();

  const outDir = join(here, '..', 'transcripts', '2026-09-04');
  await writeFile(join(outDir, 'harness1-official-sdk.json'), JSON.stringify(transcript, null, 2));
  process.stdout.write(`harness1 transcript written, ${transcript.calls.length} steps\n`);
}

main().catch((error) => {
  process.stderr.write(`harness1 failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
  process.exitCode = 1;
});

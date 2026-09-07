#!/usr/bin/env node
/**
 * Harness 2 (P6 ADDENDUM unit E, redefined): raw JSON-RPC over stdio from a plain Node script,
 * with NO MCP SDK on the client side, negotiating the OLDER 2025-06-18 protocol version string
 * (research 01_RESEARCH_A2A_MCP.md section C.1/C.2: Codex, Cursor and OpenCode default to this
 * era; a claim-less/2025-shaped opening pins `serveStdio`'s connection to a 2025-era instance
 * from the SAME factory, per that same section). Proves the "both protocol eras" claim
 * mechanically, not by reading the SDK's source.
 *
 * Wire format (confirmed by reading @modelcontextprotocol/server's own ReadBuffer/serializeMessage,
 * not assumed): one JSON object per line, newline-terminated, on stdin and stdout.
 */
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const distEntry = join(here, '..', 'dist', 'index.js');
const OLDER_PROTOCOL_VERSION = '2025-06-18';

function createLineReader(child) {
  let buffer = '';
  const waiters = [];
  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    let idx;
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      const waiter = waiters.shift();
      if (waiter) waiter(line);
    }
  });
  return () =>
    new Promise((resolve) => {
      waiters.push(resolve);
    });
}

async function main() {
  const apiBase = process.env.CAIRN_API_BASE_URL;
  if (!apiBase) throw new Error('CAIRN_API_BASE_URL is required (point it at the throwaway local server)');

  const keyDir = await mkdtemp(join(tmpdir(), 'cairn-mcp-harness2-'));
  const keyPath = join(keyDir, 'credentials.json');
  const handle = `h2${Date.now().toString(36)}`;

  const child = spawn('node', [distEntry], {
    env: { CAIRN_API_BASE_URL: apiBase, CAIRN_KEY_PATH: keyPath, PATH: process.env.PATH ?? '' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const nextLine = createLineReader(child);
  let stderrLog = '';
  child.stderr.on('data', (chunk) => {
    stderrLog += chunk.toString('utf8');
  });

  const transcript = { harness: 'raw-json-rpc-legacy-era', negotiated_protocol_version: OLDER_PROTOCOL_VERSION, messages: [] };

  function send(message) {
    transcript.messages.push({ direction: 'client_to_server', message });
    child.stdin.write(`${JSON.stringify(message)}\n`);
  }
  async function recv() {
    const line = await nextLine();
    const message = JSON.parse(line);
    transcript.messages.push({ direction: 'server_to_client', message });
    return message;
  }

  send({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: OLDER_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'harness2-raw-jsonrpc-legacy', version: '0.0.1' },
    },
  });
  const initResult = await recv();
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });

  send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  const listResult = await recv();

  send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'register_agent', arguments: { handle } } });
  await recv();

  send({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'whoami', arguments: {} } });
  await recv();

  child.stdin.end();
  child.kill('SIGTERM');

  const outDir = join(here, '..', 'transcripts', '2026-09-04');
  await writeFile(join(outDir, 'harness2-raw-jsonrpc-legacy.json'), JSON.stringify(transcript, null, 2));
  const negotiatedOk = initResult?.result?.protocolVersion === OLDER_PROTOCOL_VERSION;
  const toolCount = listResult?.result?.tools?.length ?? 0;
  process.stdout.write(
    `harness2 transcript written, ${transcript.messages.length} messages, negotiated_version_echoed=${negotiatedOk}, tool_count=${toolCount}\n`,
  );
  if (stderrLog.trim()) process.stdout.write(`harness2 server stderr: ${stderrLog.trim()}\n`);
}

main().catch((error) => {
  process.stderr.write(`harness2 failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
  process.exitCode = 1;
});

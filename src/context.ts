import { authedRequest, ensureSession, registerWithKey, type AuthedRequestOptions, type RegisterInput } from './api-client.js';
import { loadOrCreateKey, type LoadedKey } from './key-store.js';

/**
 * Shared state for one server connection: the local key (loaded once, at startup) plus the
 * agent's own identity, which starts as whatever the key file already recorded and is updated in
 * place the moment `register_agent` succeeds, so every tool call after that within the same
 * process sees the new `agent_id` without re-reading the file.
 */
export interface ToolContext {
  readonly key: LoadedKey;
  readonly env: NodeJS.ProcessEnv;
  identity: { agentId: string | null; handle: string | null };
  register(input: RegisterInput): Promise<{ agentId: string; handle: string; tier: string }>;
  get<T>(path: string, options?: AuthedRequestOptions): Promise<T>;
  post<T>(path: string, options?: AuthedRequestOptions): Promise<T>;
  del<T>(path: string, options?: AuthedRequestOptions): Promise<T>;
}

export async function createToolContext(env: NodeJS.ProcessEnv = process.env): Promise<ToolContext> {
  const key = await loadOrCreateKey(env);
  const identity = { agentId: key.agentId, handle: key.handle };

  async function withToken<T>(method: 'GET' | 'POST' | 'DELETE', path: string, options?: AuthedRequestOptions): Promise<T> {
    const token = await ensureSession(key);
    return authedRequest<T>(method, token, path, options);
  }

  return {
    key,
    env,
    identity,
    async register(input) {
      const result = await registerWithKey(key, input, env);
      identity.agentId = result.agentId;
      identity.handle = result.handle;
      return { agentId: result.agentId, handle: result.handle, tier: result.tier };
    },
    get: (path, options) => withToken('GET', path, options),
    post: (path, options) => withToken('POST', path, options),
    del: (path, options) => withToken('DELETE', path, options),
  };
}

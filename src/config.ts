/**
 * The only two environment inputs this package reads (plan D.3, D.4): where the key lives
 * (`CAIRN_KEY_PATH`, read in `key-store.ts`) and which Cairn deployment to talk to. Production
 * default is the real host; `CAIRN_API_BASE_URL` overrides it for local development and for the
 * P6 integration tests against the throwaway local server on port 3106.
 */
export function apiBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env.CAIRN_API_BASE_URL;
  if (fromEnv && fromEnv.trim() !== '') return fromEnv.replace(/\/+$/, '');
  return 'https://agents.mightys.dev';
}

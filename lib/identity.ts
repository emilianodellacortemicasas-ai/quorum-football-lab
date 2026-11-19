// Single source of truth for "who is calling". Fails closed.
// Production: Cloudflare Access JWT verified on the server (signature, audience, issuer, expiry).
// Local dev only (vite dev, localhost): the local mock sign-in, which strips client-sent identity headers.
// Client-supplied identity headers are never trusted in a production build.
import { env } from 'cloudflare:workers';
import { accessTokenFrom, verifyAccessJwt } from './access-jwt';

export type Identity = { userId: string; email: string; via: 'cloudflare-access' | 'local-dev' };

const runtime = () => env as unknown as Record<string, string | undefined>;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

function allowed(email: string) {
  const list = (runtime().QUORUM_ALLOWED_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  // Defense in depth: the Access policy is the primary gate; this list must also match when set.
  return !list.length || list.includes(email.toLowerCase());
}

export async function identityFromHeaders(headers: Headers, url: string): Promise<Identity | null> {
  const e = runtime();
  if (e.CF_ACCESS_TEAM_DOMAIN && e.CF_ACCESS_AUD) {
    const claims = await verifyAccessJwt(accessTokenFrom(headers), { teamDomain: e.CF_ACCESS_TEAM_DOMAIN, audience: e.CF_ACCESS_AUD });
    if (!claims || !allowed(claims.email)) return null;
    return { userId: 'cfa:' + claims.sub, email: claims.email.toLowerCase(), via: 'cloudflare-access' };
  }
  if (import.meta.env.DEV) {
    let host = '';
    try { host = new URL(url).hostname.toLowerCase(); } catch { return null; }
    const id = headers.get('oai-authenticated-user-id'), email = headers.get('oai-authenticated-user-email');
    if (LOCAL_HOSTS.has(host) && id && email) return { userId: id, email: email.toLowerCase(), via: 'local-dev' };
  }
  return null;
}

export const getIdentity = (request: Request) => identityFromHeaders(request.headers, request.url);

export async function isOwner(request: Request, identity?: Identity | null) {
  const expected = runtime().QUORUM_ADMIN_EMAIL;
  const who = identity === undefined ? await getIdentity(request) : identity;
  return Boolean(expected && who && who.email === expected.toLowerCase());
}

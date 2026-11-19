// Cloudflare Access JWT verification. Pure WebCrypto: no Cloudflare imports, so it runs in tests.
// Access signs with RS256; certs live at https://<team>.cloudflareaccess.com/cdn-cgi/access/certs.

export type AccessClaims = { sub: string; email: string; aud: string[]; iss: string; exp: number; nbf?: number; iat?: number };
export type Jwk = { kid: string; kty: string; n: string; e: string; alg?: string };
export type AccessConfig = { teamDomain: string; audience: string };

const b64urlToBytes = (value: string) => {
  const pad = value.length % 4 ? '='.repeat(4 - (value.length % 4)) : '';
  const bin = atob(value.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
const decodeJson = (segment: string) => JSON.parse(new TextDecoder().decode(b64urlToBytes(segment)));

export function normalizeTeamDomain(teamDomain: string) {
  const host = teamDomain.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '').toLowerCase();
  if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(host)) throw new Error('CF_ACCESS_TEAM_DOMAIN non valido');
  return 'https://' + host;
}

let cache: { url: string; keys: Jwk[]; at: number } | null = null;
export function clearJwksCache() { cache = null; }

export async function fetchAccessKeys(teamDomain: string, fetcher: typeof fetch = fetch, now = Date.now()) {
  const url = normalizeTeamDomain(teamDomain) + '/cdn-cgi/access/certs';
  if (cache && cache.url === url && now - cache.at < 10 * 60_000) return cache.keys;
  const r = await fetcher(url, { signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error('Chiavi Access non disponibili');
  const body = (await r.json()) as { keys?: Jwk[] };
  if (!Array.isArray(body.keys) || !body.keys.length) throw new Error('Chiavi Access non valide');
  cache = { url, keys: body.keys, at: now };
  return body.keys;
}

/** Returns verified claims or null. Never throws on a bad token; throws only on misconfiguration. */
export async function verifyAccessJwt(
  token: string | null | undefined,
  config: AccessConfig,
  options: { keys?: Jwk[]; fetcher?: typeof fetch; nowSeconds?: number } = {},
): Promise<AccessClaims | null> {
  if (!token || token.length > 8192) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  let header: { alg?: string; kid?: string }, claims: AccessClaims;
  try { header = decodeJson(parts[0]); claims = decodeJson(parts[1]); } catch { return null; }
  if (header.alg !== 'RS256' || !header.kid) return null;

  const issuer = normalizeTeamDomain(config.teamDomain);
  const keys = options.keys ?? (await fetchAccessKeys(config.teamDomain, options.fetcher));
  const jwk = keys.find((k) => k.kid === header.kid && k.kty === 'RSA');
  if (!jwk) { if (!options.keys) clearJwksCache(); return null; }

  let valid = false;
  try {
    const key = await crypto.subtle.importKey('jwk', { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
  } catch { return null; }
  if (!valid) return null;

  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000), skew = 60;
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud as unknown as string];
  if (!aud.includes(config.audience)) return null;
  if (claims.iss !== issuer) return null;
  if (typeof claims.exp !== 'number' || claims.exp + skew < now) return null;
  if (typeof claims.nbf === 'number' && claims.nbf - skew > now) return null;
  if (typeof claims.sub !== 'string' || !claims.sub || typeof claims.email !== 'string' || !claims.email.includes('@')) return null;
  return { ...claims, aud };
}

export function accessTokenFrom(headers: Headers) {
  const header = headers.get('cf-access-jwt-assertion');
  if (header) return header;
  const cookie = headers.get('cookie') ?? '';
  const match = cookie.split(';').map((c) => c.trim()).find((c) => c.startsWith('CF_Authorization='));
  return match ? match.slice('CF_Authorization='.length) : null;
}

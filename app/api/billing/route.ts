import { getIdentity, isOwner } from '../../../lib/identity';
import { PLANS, checkout, commerce, planOf, portal } from '../../../lib/commerce';

const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

// Public price list + the caller's plan (when signed in).
export async function GET(request: Request) {
  const who = await getIdentity(request).catch(() => null);
  const c = await commerce();
  const me = who ? await planOf(who.email, await isOwner(request, who)) : null;
  return reply({ sales: c.enabled, plans: PLANS, business: c.business, me, email: who?.email ?? null });
}

export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return reply({ error: 'Origine non valida.' }, 403);
  const who = await getIdentity(request); if (!who) return reply({ error: 'Accedi per abbonarti.' }, 401);
  const body: any = await request.json().catch(() => ({}));
  const origin = new URL(request.url).origin;
  try {
    if (body.action === 'checkout') return reply(await checkout(who.email, String(body.price), origin, body.immediate === true));
    if (body.action === 'portal') return reply(await portal(who.email, origin));
    return reply({ error: 'Azione non valida.' }, 400);
  } catch (e) { return reply({ error: e instanceof Error ? e.message : 'Operazione non riuscita.' }, 422); }
}

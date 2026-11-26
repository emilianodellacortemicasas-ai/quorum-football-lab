import { stripeWebhook } from '../../../../lib/commerce';

// Stripe → QUORUM. Must be reachable without Cloudflare Access (bypass policy on this path only).
// Every event is verified with the signing secret before anything is written.
export async function POST(request: Request) {
  const raw = await request.text();
  try { return Response.json(await stripeWebhook(raw, request.headers.get('stripe-signature'))); }
  catch (e) { return Response.json({ error: e instanceof Error ? e.message : 'Errore' }, { status: 400 }); }
}

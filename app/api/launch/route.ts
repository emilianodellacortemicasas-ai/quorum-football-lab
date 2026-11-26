import { getIdentity, isOwner } from '../../../lib/identity';
import { launchStatus, updateLaunch } from '../../../lib/commerce';

const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET(request: Request) {
  if (!await isOwner(request, await getIdentity(request))) return reply({ error: 'Solo l’amministratore.' }, 403);
  return reply(await launchStatus());
}
export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return reply({ error: 'Origine non valida.' }, 403);
  if (!await isOwner(request, await getIdentity(request))) return reply({ error: 'Solo l’amministratore.' }, 403);
  try { return reply(await updateLaunch(await request.json())); }
  catch (e) { return reply({ error: e instanceof Error ? e.message : 'Operazione non riuscita.' }, 422); }
}

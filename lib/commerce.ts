// QUORUM commercial layer: plans, subscriptions, Stripe checkout/portal/webhook and the launch checklist.
// Sales stay OFF until the owner switches them on from /lancio, and the switch only works when every
// mandatory item of the checklist is done. While sales are off every user keeps full access (as today).
import { env } from 'cloudflare:workers';
import { credentialValue } from './vault';

const db = () => env.DB!;
export type PlanId = 'base' | 'pro' | 'tipster';
export type Feature = 'tcenter-full' | 'tickets' | 'builder' | 'lab' | 'backtest' | 'public-profile' | 'multi-portfolio' | 'export';

export const PLANS: Record<PlanId, { name: string; month: number; year: number; pitch: string; features: Feature[]; lines: string[] }> = {
  base: { name: 'Base', month: 0, year: 0, pitch: 'Per chi inizia e vuole capire prima di giocare.', features: [],
    lines: ['Pronostici con probabilità e quota giusta', 'Guida al metodo e gestione del capitale', 'Diario personale delle giocate', '1 opportunità del Centro Tipster al giorno'] },
  pro: { name: 'Pro', month: 1490, year: 11900, pitch: 'Per chi gioca con regole e vuole il metodo completo.', features: ['tcenter-full', 'tickets', 'builder', 'lab', 'backtest', 'export'],
    lines: ['Centro Tipster completo con checklist e livelli A/B/C', 'Quote ricontrollate prima delle partite', 'Schedine pronte, combo e laboratorio', 'Backtest e registro del metodo', 'Esportazione dei dati'] },
  tipster: { name: 'Tipster', month: 3900, year: 34900, pitch: 'Per il tipster che vuole un registro certificato.', features: ['tcenter-full', 'tickets', 'builder', 'lab', 'backtest', 'export', 'public-profile', 'multi-portfolio'],
    lines: ['Tutto quello di Pro', 'Profilo pubblico con registro certificato: CLV, data e ora non modificabili', 'Più portafogli separati', 'Statistiche avanzate per mercato e campionato'] },
};
export const FREE_DAILY_OPPORTUNITIES = 1;

// ---- Launch checklist: manual items the owner ticks + technical items checked automatically. ----
export const CHECKLIST: { id: string; group: string; label: string; detail: string; required: boolean }[] = [
  { id: 'piva', group: 'Impresa e fisco', label: 'Partita IVA aperta', detail: 'Registro imprese, INPS, PEC, firma digitale. Regime scelto con il commercialista.', required: true },
  { id: 'ateco', group: 'Impresa e fisco', label: 'Codice ATECO e IVA definiti', detail: 'Codice da software/portale; come emettere i documenti di vendita; OSS se vendi a consumatori di altri Paesi UE.', required: true },
  { id: 'legal-opinion', group: 'Contratti e consumatori', label: 'Parere legale sul Decreto Dignità', detail: 'Parere scritto dell’avvocato sull’app com’è (quote, confronto operatori, testi).', required: true },
  { id: 'terms', group: 'Contratti e consumatori', label: 'Termini e condizioni validati', detail: 'Le bozze in /termini riviste e approvate dall’avvocato.', required: true },
  { id: 'withdrawal', group: 'Contratti e consumatori', label: 'Recesso di 14 giorni impostato', detail: 'Testo del recesso e rinuncia espressa per l’accesso immediato, validati.', required: true },
  { id: 'privacy', group: 'Contratti e consumatori', label: 'Privacy e cookie validati', detail: 'Informativa, cookie policy, registro dei trattamenti, contratti con i fornitori.', required: true },
  { id: 'trademark', group: 'Marchio, dati, pagamenti', label: 'Marchio QUORUM depositato', detail: 'Ricerca anteriorità e deposito UIBM. Non blocca il lancio, ma va fatto prima della pubblicità.', required: false },
  { id: 'data-licenses', group: 'Marchio, dati, pagamenti', label: 'Licenze dati per uso commerciale', detail: 'Sportmonks, The Odds API, OddsPapi: piano adatto a mostrare i dati a clienti paganti.', required: true },
  { id: 'stripe-approved', group: 'Marchio, dati, pagamenti', label: 'Stripe ha approvato l’attività', detail: 'Conferma scritta che il software di analisi sportiva è accettato.', required: true },
  { id: 'auth-public', group: 'Tecnica', label: 'Accesso aperto al pubblico', detail: 'Fino a 50 utenti: Cloudflare Access con codice via email aperto a tutti. Oltre: accesso proprio di QUORUM.', required: true },
];
export type Business = { name: string; vat: string; address: string; email: string; pec: string; court?: string };
export type Commerce = { enabled: boolean; enabledAt?: string; checklist: Record<string, boolean>; business: Business | null; prices: Partial<Record<'pro_m' | 'pro_y' | 'tipster_m' | 'tipster_y', string>>; updatedAt?: string };
const EMPTY: Commerce = { enabled: false, checklist: {}, business: null, prices: {} };

export async function commerce(): Promise<Commerce> {
  const row = await db().prepare("SELECT payload FROM model_state WHERE id='commerce'").first<{ payload: string }>().catch(() => null);
  return row ? { ...EMPTY, ...JSON.parse(row.payload) } : EMPTY;
}
async function saveCommerce(c: Commerce) {
  c.updatedAt = new Date().toISOString();
  await db().prepare("INSERT INTO model_state (id,built_at,payload) VALUES ('commerce',?,?) ON CONFLICT(id) DO UPDATE SET built_at=excluded.built_at,payload=excluded.payload").bind(c.updatedAt, JSON.stringify(c)).run();
  return c;
}
export async function launchStatus() {
  const c = await commerce();
  const [sk, wh] = await Promise.all([credentialValue('stripe').then(Boolean).catch(() => false), credentialValue('stripe-webhook').then(Boolean).catch(() => false)]);
  const b = c.business;
  const tech = [
    { id: 'stripe-key', label: 'Chiave segreta Stripe nella cassaforte', ok: sk },
    { id: 'stripe-webhook', label: 'Segreto del webhook Stripe nella cassaforte', ok: wh },
    { id: 'prices', label: 'Prezzi Pro e Tipster creati su Stripe e collegati', ok: !!(c.prices.pro_m && c.prices.pro_y && c.prices.tipster_m && c.prices.tipster_y) },
    { id: 'business', label: 'Dati dell’impresa compilati (appaiono in termini, privacy e ricevute)', ok: !!(b && b.name && /^\d{11}$/.test(b.vat) && b.address && b.email && b.pec) },
  ];
  // The method's measured edge is a launch requirement like the paperwork.
  const { storedCenter } = await import('./tipster-center-job'); const { salesGoal } = await import('./tipster-center');
  const center: any = await storedCenter().catch(() => null);
  const goal = center?.performance ? salesGoal(center.performance) : null;
  tech.unshift({ id: 'edge', label: 'Obiettivo del metodo: 300 singole, CLV ≥ +2%, vantaggio statisticamente certo', ok: !!goal?.reached });
  const missing = [...CHECKLIST.filter(i => i.required && !c.checklist[i.id]).map(i => i.label), ...tech.filter(t => !t.ok).map(t => t.label)];
  const oddsPlan = await import('./italian-odds').then(m => m.oddsPlan()).catch(() => null);
  return { ...c, items: CHECKLIST, tech, missing, goal, oddsPlan, ready: missing.length === 0 };
}
export async function updateLaunch(body: any) {
  const c = await commerce();
  if (body.action === 'check' && CHECKLIST.some(i => i.id === body.id)) c.checklist[body.id] = !!body.done;
  else if (body.action === 'business') {
    const s = (v: unknown, n = 200) => String(v ?? '').trim().slice(0, n);
    c.business = { name: s(body.name), vat: s(body.vat, 11).replace(/\D/g, ''), address: s(body.address), email: s(body.email, 120), pec: s(body.pec, 120), court: s(body.court, 120) };
  } else if (body.action === 'prices') {
    for (const k of ['pro_m', 'pro_y', 'tipster_m', 'tipster_y'] as const) { const v = String(body[k] ?? '').trim(); if (!v) delete c.prices[k]; else if (/^price_[A-Za-z0-9]{8,64}$/.test(v)) c.prices[k] = v; else throw new Error('ID prezzo non valido: ' + k + ' (deve iniziare con price_).'); }
  } else if (body.action === 'odds-plan') {
    const { setOddsPlan } = await import('./italian-odds'); await setOddsPlan(!!body.paid, Number(body.limit)); return launchStatus();
  } else if (body.action === 'enable') {
    if (body.on) { const st = await launchStatus(); if (!st.ready) throw new Error('Mancano ancora: ' + st.missing.join(' · ')); c.enabled = true; c.enabledAt = new Date().toISOString(); }
    else c.enabled = false;
  } else throw new Error('Azione non valida.');
  await saveCommerce(c);
  return launchStatus();
}

// ---- Subscriptions ----
type Sub = { email: string; plan: PlanId; status: string; customer: string | null; subscription: string | null; period_end: string | null };
export async function subscriptionOf(email: string): Promise<Sub | null> {
  return db().prepare('SELECT email,plan,status,customer,subscription,period_end FROM subscriptions WHERE email=?').bind(email.toLowerCase()).first<Sub>().catch(() => null);
}
// The plan a user can use now. Sales off → everyone has everything (the app works as today).
export async function planOf(email: string | undefined, owner: boolean): Promise<{ plan: PlanId; sales: boolean; status: string | null; periodEnd: string | null }> {
  const c = await commerce();
  if (!c.enabled || owner || !email) return { plan: 'tipster', sales: c.enabled, status: null, periodEnd: null };
  const s = await subscriptionOf(email);
  const active = s && ['active', 'trialing', 'past_due'].includes(s.status) && (!s.period_end || Date.parse(s.period_end) > Date.now() - 3 * 86400000);
  return { plan: active ? s!.plan : 'base', sales: true, status: s?.status ?? null, periodEnd: s?.period_end ?? null };
}
export const has = (plan: PlanId, f: Feature) => PLANS[plan].features.includes(f);

// ---- Stripe (REST API, no SDK). Keys come only from the encrypted vault, entered by the owner. ----
async function stripe(path: string, params: Record<string, string> | null, method = 'POST') {
  const key = await credentialValue('stripe'); if (!key) throw new Error('Pagamenti non ancora attivi.');
  const r = await fetch('https://api.stripe.com/v1/' + path, { method, headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/x-www-form-urlencoded' }, body: params ? new URLSearchParams(params).toString() : undefined, signal: AbortSignal.timeout(20000) });
  const d: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Stripe: ' + (d?.error?.message ?? 'HTTP ' + r.status));
  return d;
}
export async function checkout(email: string, priceKey: string, origin: string, waiveWithdrawal: boolean) {
  const c = await commerce(); if (!c.enabled) throw new Error('Gli abbonamenti non sono ancora in vendita.');
  const price = (c.prices as any)[priceKey]; if (!price) throw new Error('Piano non disponibile.');
  if (!waiveWithdrawal) throw new Error('Per iniziare subito devi confermare la richiesta di accesso immediato.');
  const plan: PlanId = priceKey.startsWith('tipster') ? 'tipster' : 'pro';
  const s = await subscriptionOf(email);
  const p: Record<string, string> = { mode: 'subscription', 'line_items[0][price]': price, 'line_items[0][quantity]': '1', success_url: origin + '/prezzi?ok=1', cancel_url: origin + '/prezzi',
    'metadata[email]': email, 'metadata[plan]': plan, 'subscription_data[metadata][email]': email, 'subscription_data[metadata][plan]': plan, 'metadata[immediate_access]': 'requested', locale: 'it', allow_promotion_codes: 'true', 'automatic_tax[enabled]': 'true', billing_address_collection: 'required', 'tax_id_collection[enabled]': 'true' };
  if (s?.customer) p.customer = s.customer; else p.customer_email = email;
  const session = await stripe('checkout/sessions', p);
  return { url: session.url as string };
}
export async function portal(email: string, origin: string) {
  const s = await subscriptionOf(email); if (!s?.customer) throw new Error('Nessun abbonamento da gestire.');
  const session = await stripe('billing_portal/sessions', { customer: s.customer, return_url: origin + '/prezzi' });
  return { url: session.url as string };
}
async function hmac(secret: string, text: string) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(text)))].map(b => b.toString(16).padStart(2, '0')).join('');
}
// Verifies the Stripe-Signature header (t=…,v1=…) with a 5-minute tolerance.
export async function verifyStripe(raw: string, header: string | null, secret: string, now = Date.now()) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(',').map(x => x.split('=') as [string, string]));
  const t = Number(parts.t); if (!t || Math.abs(now / 1000 - t) > 300) return false;
  const sig = await hmac(secret, t + '.' + raw);
  return header.split(',').some(x => x === 'v1=' + sig);
}
async function upsert(email: string, plan: PlanId, status: string, customer: string | null, subscription: string | null, periodEnd: string | null) {
  await db().prepare('INSERT INTO subscriptions (email,plan,status,customer,subscription,period_end,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET plan=excluded.plan,status=excluded.status,customer=COALESCE(excluded.customer,subscriptions.customer),subscription=COALESCE(excluded.subscription,subscriptions.subscription),period_end=excluded.period_end,updated_at=excluded.updated_at')
    .bind(email.toLowerCase(), plan, status, customer, subscription, periodEnd, new Date().toISOString()).run();
}
export async function stripeWebhook(raw: string, header: string | null) {
  const secret = await credentialValue('stripe-webhook'); if (!secret) throw new Error('Webhook non configurato.');
  if (!await verifyStripe(raw, header, secret)) throw new Error('Firma non valida.');
  const ev = JSON.parse(raw), o = ev.data?.object ?? {};
  if (ev.type === 'checkout.session.completed' && o.mode === 'subscription') {
    const email = o.metadata?.email ?? o.customer_details?.email; if (email) await upsert(email, o.metadata?.plan === 'tipster' ? 'tipster' : 'pro', 'active', o.customer ?? null, o.subscription ?? null, null);
  } else if (ev.type?.startsWith('customer.subscription.')) {
    const email = o.metadata?.email; if (!email) return { ok: true };
    const end = o.current_period_end ?? o.items?.data?.[0]?.current_period_end;
    await upsert(email, o.metadata?.plan === 'tipster' ? 'tipster' : 'pro', ev.type === 'customer.subscription.deleted' ? 'canceled' : String(o.status), o.customer ?? null, o.id ?? null, end ? new Date(end * 1000).toISOString() : null);
  }
  return { ok: true };
}

// Never forward raw upstream bodies: they may contain credentials or private input.
// Only short machine fields (code, type), the HTTP status and the request id leave the server.
const safeToken = (v: unknown) => (typeof v === 'string' && /^[a-z0-9_.-]{2,64}$/i.test(v) ? v : undefined);

export function classifyOpenAiError(status: number, payload: unknown, phase: 'models' | 'report') {
  const p = payload as any, e = p?.error;
  const m = typeof e?.message === 'string' ? e.message.toLowerCase() : typeof e === 'string' ? e.toLowerCase() : '';
  const code = typeof e?.code === 'string' ? e.code : '', type = typeof e?.type === 'string' ? e.type : '';
  if (/missing scopes?:.*(?:api\.)?model\.read/.test(m)) return { category: 'model_list_permission', error: 'Alla chiave manca il permesso List models: Read. Non blocca le analisi se Responses funziona; aggiungilo solo per vedere l’elenco dei modelli.' };
  if (/missing scopes?:.*(?:api\.)?(model\.request|responses)/.test(m)) return { category: 'model_request_permission', error: 'Alla chiave manca il permesso Responses: Request. Apri la chiave QUORUM su platform.openai.com, abilita Model capabilities → Responses → Request e salva. Non serve crearne una nuova.' };
  if (/insufficient permissions|missing scopes?/.test(m)) return { category: 'key_permission', error: 'La chiave non ha i permessi richiesti per questa operazione. Controlla i permessi Restricted della chiave QUORUM.' };
  if (code === 'unsupported_country_region_territory' || /unsupported (country|region|territory)|country.*not supported/.test(m)) return { category: 'region_restricted', error: 'OpenAI rifiuta la regione da cui parte la richiesta del server. Non dipende da permessi o pagamento: va fissata la posizione di esecuzione del server.' };
  if (code === 'insufficient_quota' || type === 'insufficient_quota' || /exceeded your current quota|run out of credits/.test(m)) return { category: 'billing', error: 'OpenAI segnala credito API esaurito o limite di spesa raggiunto. Controlla Billing e Limits del progetto.' };
  if (status === 429) return { category: 'rate_limit', error: 'OpenAI sta limitando la frequenza delle richieste. Attendi e riprova; non indica un problema di credito.' };
  if (status === 401) return { category: 'authentication', error: 'OpenAI non riconosce la chiave. Controlla che sia completa, attiva e non revocata.' };
  if (code === 'model_not_found' || status === 404) return { category: 'model_access', error: 'Il modello configurato non esiste o non è abilitato per questo progetto.' };
  if (code === 'organization_must_be_verified' || /must be verified|verify (your|the) organization/.test(m)) return { category: 'org_verification', error: 'OpenAI richiede la verifica dell’organizzazione per questo modello. Si completa da Settings → Organization → General.' };
  if (status === 403) return { category: 'access_denied', error: phase === 'models' ? 'OpenAI ha rifiutato l’elenco dei modelli (403). Vedi codice e riferimento della richiesta.' : 'OpenAI ha rifiutato l’analisi (403). Vedi codice e riferimento della richiesta.' };
  if (status === 400) return { category: 'bad_request', error: 'OpenAI ha rifiutato il formato della richiesta.' };
  return { category: 'provider_error', error: 'OpenAI non ha completato la richiesta. Riprova tra poco.' };
}

export async function openAiFailure(response: Response, phase: 'models' | 'report') {
  let body: unknown = null; try { body = await response.json(); } catch {}
  const e = (body as any)?.error, requestId = response.headers.get('x-request-id');
  return {
    ...classifyOpenAiError(response.status, body, phase),
    upstreamStatus: response.status,
    ...(safeToken(e?.code) ? { code: e.code } : {}),
    ...(safeToken(e?.type) ? { type: e.type } : {}),
    ...(requestId && /^[A-Za-z0-9_-]{4,120}$/.test(requestId) ? { requestId } : {}),
  };
}

// Step-by-step OpenAI key diagnosis. Each step reports only status, short codes and request ids.
// The app needs Responses: Request. List models: Read is informative, not required.

export type DiagnosticStep = {
  step: 'egress' | 'models' | 'responses';
  ok: boolean;
  label: string;
  upstreamStatus?: number; category?: string; code?: string; type?: string; requestId?: string; error?: string;
  detail?: string;
};
export type OpenAiDiagnosis = { usable: boolean; keyRecognized: boolean; model: string; modelListed: boolean | null; visibleModels: string[]; steps: DiagnosticStep[]; checkedAt: string };

export async function egressLocation(fetcher: typeof fetch = fetch): Promise<DiagnosticStep> {
  try {
    const r = await fetcher('https://www.cloudflare.com/cdn-cgi/trace', { signal: AbortSignal.timeout(8000) });
    const text = await r.text(), get = (k: string) => text.match(new RegExp('^' + k + '=([A-Za-z0-9-]{2,12})$', 'm'))?.[1];
    const colo = get('colo'), loc = get('loc');
    return { step: 'egress', ok: true, label: 'Posizione di uscita del server', detail: [loc && 'paese ' + loc, colo && 'data center ' + colo].filter(Boolean).join(' · ') || 'non determinata' };
  } catch { return { step: 'egress', ok: false, label: 'Posizione di uscita del server', detail: 'non determinata' }; }
}

export async function diagnoseOpenAi(key: string, model: string, fetcher: typeof fetch = fetch): Promise<OpenAiDiagnosis> {
  const auth = { Authorization: 'Bearer ' + key };
  const [egress, modelsResult, responsesResult] = await Promise.all([
    egressLocation(fetcher),
    fetcher('https://api.openai.com/v1/models', { headers: auth, signal: AbortSignal.timeout(20000) }).catch(() => null),
    // Minimal real request: proves Responses: Request, model access and credit. A few tokens.
    fetcher('https://api.openai.com/v1/responses', {
      method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(30000),
      body: JSON.stringify({ model, input: 'Rispondi solo con: OK', max_output_tokens: 64, store: false }),
    }).catch(() => null),
  ]);

  const steps: DiagnosticStep[] = [egress];
  let visibleModels: string[] = [], modelListed: boolean | null = null;

  if (!modelsResult) steps.push({ step: 'models', ok: false, label: 'Elenco modelli (List models: Read)', error: 'OpenAI non raggiungibile dal server.' });
  else if (modelsResult.ok) {
    const d = (await modelsResult.json().catch(() => null)) as any;
    const ids: string[] = Array.isArray(d?.data) ? d.data.map((m: any) => m?.id).filter((x: unknown): x is string => typeof x === 'string') : [];
    visibleModels = ids.filter((id) => /^(gpt|o\d)/.test(id)).sort().slice(0, 40);
    modelListed = ids.includes(model);
    steps.push({ step: 'models', ok: true, label: 'Elenco modelli (List models: Read)', upstreamStatus: 200, detail: modelListed ? 'il modello ' + model + ' è disponibile' : 'il modello ' + model + ' NON compare nell’elenco' });
  } else steps.push({ step: 'models', ok: false, label: 'Elenco modelli (List models: Read)', ...(await openAiFailure(modelsResult, 'models')) });

  if (!responsesResult) steps.push({ step: 'responses', ok: false, label: 'Richiesta reale (Responses: Request)', error: 'OpenAI non raggiungibile dal server.' });
  else if (responsesResult.ok) {
    const d = (await responsesResult.json().catch(() => null)) as any;
    steps.push({ step: 'responses', ok: true, label: 'Richiesta reale (Responses: Request)', upstreamStatus: 200, detail: 'risposta ricevuta da ' + (typeof d?.model === 'string' ? d.model : model) + (d?.status ? ' · stato ' + d.status : '') });
  } else steps.push({ step: 'responses', ok: false, label: 'Richiesta reale (Responses: Request)', ...(await openAiFailure(responsesResult, 'report')) });

  const models = steps.find((s) => s.step === 'models')!, responses = steps.find((s) => s.step === 'responses')!;
  return {
    usable: responses.ok,
    keyRecognized: models.ok || responses.ok,
    model, modelListed, visibleModels, steps, checkedAt: new Date().toISOString(),
  };
}

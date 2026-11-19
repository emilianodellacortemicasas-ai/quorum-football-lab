// Never forward raw upstream bodies: they may contain credentials or private input.
export function classifyOpenAiError(status:number,payload:unknown,phase:'models'|'report'){
 const p=payload as any,e=p?.error,m=typeof e?.message==='string'?e.message.toLowerCase():typeof e==='string'?e.toLowerCase():'',code=typeof e?.code==='string'?e.code:'',type=typeof e?.type==='string'?e.type:'';
 if(/missing scopes?:.*(?:api\.)?model\.read/.test(m))return {category:'model_list_permission',error:'Alla chiave manca il permesso List models: Read. Apri la chiave QUORUM, modifica i permessi e salva. Non serve crearne una nuova.'};
 if(/missing scopes?:.*(?:api\.)?model\.request/.test(m))return {category:'model_request_permission',error:'Alla chiave manca il permesso di richiesta del modello. Controlla Model capabilities e Responses: Request nel progetto OpenAI.'};
 if(code==='unsupported_country_region_territory'||/unsupported (country|region|territory)|country.*not supported/.test(m))return {category:'region_restricted',error:'OpenAI rifiuta la regione di questa richiesta. Il problema non si risolve ampliando i permessi della chiave.'};
 if(code==='insufficient_quota'||type==='insufficient_quota'||/exceeded your current quota|run out of credits/.test(m))return {category:'billing',error:'OpenAI segnala credito API esaurito o quota di spesa raggiunta. Controlla Billing e Limits sulla piattaforma.'};
 if(status===429)return {category:'rate_limit',error:'OpenAI sta limitando le richieste. Attendi e riprova; questo messaggio non conferma un problema di credito.'};
 if(status===401)return {category:'authentication',error:'OpenAI non autentica la chiave. Controlla che sia completa, attiva e appartenente al progetto corretto.'};
 if(code==='model_not_found'||status===404)return {category:'model_access',error:'Il modello selezionato non è disponibile per questo progetto. Verifica i modelli consentiti nelle impostazioni OpenAI.'};
 if(status===403)return {category:'access_denied',error:phase==='models'?'OpenAI ha rifiutato il controllo della chiave (403). Verifica List models: Read e l’accesso del proprietario al progetto; la causa specifica non è stata confermata.':'OpenAI ha rifiutato l’analisi (403). Controlla accesso al modello, progetto e permesso Responses: Request; la causa specifica non è stata confermata.'};
 return {category:'provider_error',error:'OpenAI non ha completato la richiesta. Riprova tra poco.'};
}
export async function openAiFailure(response:Response,phase:'models'|'report'){
 let body:unknown=null;try{body=await response.json();}catch{}
 const requestId=response.headers.get('x-request-id');
 return {...classifyOpenAiError(response.status,body,phase),upstreamStatus:response.status,...(requestId&&/^[A-Za-z0-9_-]{4,120}$/.test(requestId)?{requestId}:{})};
}

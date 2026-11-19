import { z } from 'zod';
import { getDb } from '../../../db';
import { serviceCredentials } from '../../../db/schema';
import { connectionStatuses,credentialValue,decryptIncoming,reserveOperation,vaultPublicConfiguration,reportModel } from '../../../lib/vault';
import { getIdentity,isOwner } from '../../../lib/identity';
import { diagnoseOpenAi } from '../../../lib/openai-errors';
import { clearFootballCache } from '../../../lib/provider';
import { clearSportmonksCache } from '../../../lib/sportmonks';
import { clearOddsCache } from '../../../lib/odds-provider';

const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
export async function GET(request:Request){
  const who=await getIdentity(request);
  if(!who)return reply({authenticated:false,admin:false,openai:false,football:false,securityReady:false},401);
  try{
    const statuses=await connectionStatuses(),c=vaultPublicConfiguration(),admin=await isOwner(request,who);
    return reply({authenticated:true,admin,email:who.email,...statuses,securityReady:!!c,...(admin&&c?{publicKey:c.publicKey,recipientId:c.recipientId}:{})});
  }catch{return reply({error:'Stato dei collegamenti non disponibile. Riprova tra poco.'},503);}
}
const incoming=z.union([
  z.object({provider:z.enum(['openai','api-football','sportmonks','the-odds-api']),ciphertext:z.string().regex(/^[A-Za-z0-9_-]{600,800}$/),recipientId:z.string().min(8).max(100)}).strict(),
  // Re-check the OpenAI key already saved, without pasting it again.
  z.object({provider:z.literal('openai'),recheck:z.literal(true)}).strict(),
]);
export async function POST(request:Request){
  const who=await getIdentity(request);
  if(!who||!await isOwner(request,who))return reply({error:'Solo il proprietario di QUORUM può configurare i collegamenti.'},403);
  if(request.headers.get('origin')!==new URL(request.url).origin)return reply({error:'Origine della richiesta non valida.'},403);
  try{
    const text=await request.text();if(text.length>3000)return reply({error:'Richiesta troppo grande.'},413);
    const body=incoming.parse(JSON.parse(text));
    if(!await reserveOperation('credential-check:'+new Date().toISOString().slice(0,10),20))return reply({error:'Raggiunto il limite giornaliero dei controlli. Riprova domani.'},429);

    if('recheck' in body){
      const key=await credentialValue('openai');
      if(!key)return reply({error:'Nessuna chiave OpenAI salvata da ricontrollare.'},409);
      const diagnosis=await diagnoseOpenAi(key,reportModel());
      return reply({saved:true,...await connectionStatuses(),diagnosis,message:diagnosis.usable?'Chiave OpenAI pronta: richiesta reale completata.':'Chiave salvata ma non ancora utilizzabile per le analisi. Vedi la diagnosi.'},diagnosis.usable?200:422);
    }

    const key=await decryptIncoming(body.ciphertext,body.provider,body.recipientId);
    let diagnosis=null;
    if(body.provider==='openai'){
      diagnosis=await diagnoseOpenAi(key,reportModel());
      // Save when OpenAI recognized the key on at least one step, so permission fixes don't require re-pasting.
      if(!diagnosis.keyRecognized)return reply({saved:false,diagnosis,error:'OpenAI non ha accettato la chiave in nessun passaggio. Nessun salvataggio eseguito. Vedi la diagnosi.'},422);
    }else if(body.provider==='api-football'){
      const r=await fetch('https://v3.football.api-sports.io/status',{headers:{'x-apisports-key':key},signal:AbortSignal.timeout(20000)});
      if(!r.ok)return reply({error:'API-Football non accetta la chiave o non è disponibile (HTTP '+r.status+'). Nessun salvataggio eseguito.'},422);
      const d=await r.json() as any;
      if(Object.keys(d.errors||{}).length||!d.response?.subscription)return reply({error:'API-Football non ha confermato il collegamento. Controlla account e chiave.'},422);
    }else if(body.provider==='sportmonks'){
      const r=await fetch('https://api.sportmonks.com/v3/football/leagues?per_page=1',{headers:{Authorization:key},signal:AbortSignal.timeout(20000)});
      if(!r.ok)return reply({error:'Sportmonks non autorizza il collegamento (HTTP '+r.status+'). Controlla token e abbonamento Football API.',saved:false},422);
      const d=await r.json() as any;if(!Array.isArray(d.data))return reply({error:'Sportmonks non ha confermato il collegamento.',saved:false},422);
    }else{
      const r=await fetch('https://api.the-odds-api.com/v4/sports',{headers:{'x-api-key':key},signal:AbortSignal.timeout(20000)});
      if(!r.ok)return reply({error:'The Odds API non autorizza il collegamento (HTTP '+r.status+'). Controlla chiave e account.',saved:false},422);
      if(!Array.isArray(await r.json()))return reply({error:'The Odds API non ha confermato il collegamento.',saved:false},422);
    }
    const verifiedAt=new Date().toISOString();
    await getDb().insert(serviceCredentials).values({provider:body.provider,ciphertext:body.ciphertext,recipientId:body.recipientId,owner:who.userId,verifiedAt}).onConflictDoUpdate({target:serviceCredentials.provider,set:{ciphertext:body.ciphertext,recipientId:body.recipientId,owner:who.userId,verifiedAt}});
    if(body.provider==='api-football')clearFootballCache();
    if(body.provider==='sportmonks')clearSportmonksCache();
    if(body.provider==='the-odds-api')clearOddsCache();
    const message=body.provider!=='openai'?'Chiave cifrata salvata e collegamento al fornitore verificato.'
      :diagnosis!.usable?'Chiave cifrata salvata. Richiesta reale a OpenAI completata: l’analista AI è pronto.'
      :'Chiave cifrata salvata, ma OpenAI non permette ancora le analisi. Correggi il punto indicato nella diagnosi e premi “Ricontrolla”: non serve reincollare la chiave.';
    return reply({saved:true,...await connectionStatuses(),diagnosis,message});
  }catch(e){
    if(e instanceof z.ZodError||e instanceof SyntaxError)return reply({error:'Dati di collegamento non validi.'},422);
    // Never log upstream bodies, authorization headers, plaintext keys or crypto input.
    return reply({error:e instanceof Error&&/cifrato|sicurezza|Formato/.test(e.message)?e.message:'Collegamento non riuscito. Riprova tra poco; nessuna conferma di salvataggio.'},503);
  }
}

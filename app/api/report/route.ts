import { z } from 'zod';
import { demoMatches } from '../../../lib/demo';
import { getLiveMatch } from '../../../lib/provider';
import { credentialValue, reportModel, reserveOperation } from '../../../lib/vault';
import { reportFacts, reportInput, reportInstructions, reportJsonSchema, reportOutput } from '../../../lib/report-contract';
import { openAiFailure } from '../../../lib/openai-errors';

const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(request:Request){
  if(!request.headers.get('oai-authenticated-user-id'))return reply({error:'Accedi al tuo spazio per usare l’analista AI.'},401);
  if(request.headers.get('origin')!==new URL(request.url).origin)return reply({error:'Origine della richiesta non valida.'},403);
  try{
    const text=await request.text();if(text.length>2000)return reply({error:'Richiesta troppo grande.'},413);
    const input=reportInput.parse(JSON.parse(text));
    const match=input.source==='demo'?demoMatches.find(m=>m.id===input.fixtureId):await getLiveMatch(input.fixtureId);
    if(!match)return reply({error:'Partita non disponibile.'},404);
    const facts=reportFacts(match,input.market,input.odds),key=await credentialValue('openai');
    if(!key)return reply({error:'Collega prima la chiave OpenAI nella pagina Collegamenti.'},409);
    if(!await reserveOperation('ai-report:'+new Date().toISOString().slice(0,10),20))return reply({error:'Raggiunto il limite di 20 analisi giornaliere del laboratorio. Riprova domani.'},429);
    const model=reportModel();
    const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({model,reasoning:{effort:'low'},instructions:reportInstructions,input:JSON.stringify(facts),store:false,max_output_tokens:1800,text:{format:{type:'json_schema',name:'quorum_explanation',strict:true,schema:reportJsonSchema}}}),signal:AbortSignal.timeout(55000)});
    if(!response.ok)return reply(await openAiFailure(response,'report'),502);
    const data=await response.json() as any;
    if(data.status!=='completed')return reply({error:'L’AI non ha completato la spiegazione. Riprova con una nuova richiesta.'},502);
    const output=(data.output||[]).filter((x:any)=>x.type==='message').flatMap((x:any)=>x.content||[]).filter((x:any)=>x.type==='output_text').map((x:any)=>x.text).join('');
    const explanation=reportOutput.parse(JSON.parse(output));
    return reply({explanation,facts,model,generatedAt:new Date().toISOString()});
  }catch(e){
    if(e instanceof z.ZodError||e instanceof SyntaxError)return reply({error:'Dati o risposta AI non validi. Nessun risultato viene mostrato.'},422);
    return reply({error:'Analisi non disponibile. Verifica collegamenti e dati della partita.'},503);
  }
}

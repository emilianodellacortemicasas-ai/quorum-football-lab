import { z } from 'zod';
import { analyzeMatch, marketLabel, MODEL_VERSION } from './math';
import type { Match } from './types';

export const reportInput=z.object({fixtureId:z.string().min(1).max(80),source:z.enum(['demo','live']),market:z.string().min(1).max(80),odds:z.number().min(1.01).max(1000).nullable()}).strict();
export const reportOutput=z.object({summary:z.string().min(1).max(1000),interpretation:z.string().min(1).max(1600),limitations:z.array(z.string().min(1).max(600)).min(1).max(5),riskNotes:z.array(z.string().min(1).max(600)).min(1).max(4)}).strict();
export const reportJsonSchema={type:'object',properties:{summary:{type:'string'},interpretation:{type:'string'},limitations:{type:'array',items:{type:'string'}},riskNotes:{type:'array',items:{type:'string'}}},required:['summary','interpretation','limitations','riskNotes'],additionalProperties:false};
export function reportFacts(match:Match,market:string,odds:number|null){
  const a=analyzeMatch(match),p=a?.markets[market];
  if(p===undefined||p<=0)throw new Error('Questo mercato non dispone di una stima sufficiente.');
  return {fixture:match.home+' – '+match.away,competition:match.competition,source:match.source,synthetic:match.source==='demo',model:MODEL_VERSION,validated:false,market:marketLabel(market),probability:p,fairOdds:1/p,odds,oddsOrigin:odds===null?'unavailable':match.source==='demo'?'synthetic_or_user_input':'user_input_unverified',expectedNetPerUnit:odds===null?null:p*odds-1,sample:{home:match.sampleHome,away:match.sampleAway},notes:match.notes};
}
export const reportInstructions='Sei l’analista didattico di QUORUM. Rispondi in italiano usando esclusivamente i fatti JSON forniti. Le probabilità vengono dal modello matematico sperimentale: non modificarle e non crearne di nuove. Interpreta qualità del campione, valore atteso e rischio con linguaggio chiaro. Non inventare forma, infortuni, formazioni, statistiche o quote. Se synthetic=true, chiarisci subito che sono scenari sintetici e non pronostici reali. Il modello non è validato; una stima non è una probabilità affidabile dimostrata. Non promettere vincite o rendite, non consigliare una puntata e non creare sistemi. Descrivi i limiti dei dati e il fatto che la gestione del rischio non crea un vantaggio matematico. Evita nuovi numeri e percentuali nella spiegazione: vengono mostrati separatamente dalla piattaforma. Restituisci summary, interpretation, limitations e riskNotes secondo lo schema.';

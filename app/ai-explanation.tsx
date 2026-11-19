'use client';
import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { Match } from '../lib/types';
import type { z } from 'zod';
import type { reportOutput } from '../lib/report-contract';
export function AiExplanation({match,market,odds}:{match:Match;market:string;odds:number|null}){
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[report,setReport]=useState<{explanation:z.infer<typeof reportOutput>;model:string}|null>(null);
  async function generate(){setBusy(true);setError('');setReport(null);try{const r=await fetch('/api/report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fixtureId:match.id,source:match.source,market,odds})});const d=await r.json() as any;if(!r.ok)throw new Error(d.error||'Analisi non disponibile.');setReport(d);}catch(e){setError(e instanceof Error?e.message:'Analisi non disponibile.');}finally{setBusy(false);}}
  return <div className="ai-explanation"><span className="secure-label"><Sparkles size={17}/> ANALISTA AI</span><h3>Capisci che cosa dice la stima.</h3><p>Una spiegazione dei dati e del mercato selezionato, con limiti e rischi in chiaro. Le probabilità restano calcolate dalla matematica.</p><p className="tiny">Richiede la chiave OpenAI collegata e credito API. Ogni richiesta consuma credito; massimo 20 richieste al giorno per il laboratorio.</p><button className="primary" disabled={busy} onClick={generate}>{busy?'L’analista sta elaborando…':'Genera la spiegazione'}</button> <a href="/collegamenti">Gestisci collegamenti</a>{error&&<p className="connection-error" role="alert">{error}</p>}{report&&<section className="generated-report" aria-live="polite"><h3>{report.explanation.summary}</h3><p>{report.explanation.interpretation}</p><h4>Limiti dei dati</h4><ul>{report.explanation.limitations.map((s,i)=><li key={i}>{s}</li>)}</ul><h4>Rischio e metodo</h4><ul>{report.explanation.riskNotes.map((s,i)=><li key={i}>{s}</li>)}</ul><p className="tiny">Generata da {report.model}. Controlla sempre i dati di partenza. Modello statistico non validato.</p></section>}</div>;
}

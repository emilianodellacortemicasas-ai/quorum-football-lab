'use client';
import { useEffect, useState } from 'react';
import { Check, CircleAlert, KeyRound, LoaderCircle, LockKeyhole, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { sealCredential, validCredential, type CredentialProvider } from '../../lib/key-crypto';

type Status={authenticated:boolean;admin:boolean;email?:string;openai:boolean;football:boolean;sportmonks:boolean;odds:boolean;securityReady:boolean;model?:string;publicKey?:JsonWebKey;recipientId?:string;error?:string};
type Step={step:string;ok:boolean;label:string;upstreamStatus?:number;category?:string;code?:string;type?:string;requestId?:string;error?:string;detail?:string};
type Diagnosis={usable:boolean;keyRecognized:boolean;model:string;modelListed:boolean|null;visibleModels:string[];steps:Step[];checkedAt:string};
const providers:{provider:CredentialProvider;statusKey:'openai'|'football'|'sportmonks'|'odds';title:string;caption:string;text:string;plan:string;price:string;portal:string;pricing:string}[]=[
 {provider:'openai',statusKey:'openai',title:'OpenAI',caption:'Il tuo analista AI',text:'Incolla la chiave QUORUM già creata. L’analista interpreta dati e calcoli; non genera le probabilità del modello.',plan:'API a consumo',price:'Costo in base ai token',portal:'https://platform.openai.com/api-keys',pricing:'https://platform.openai.com/settings/organization/billing'},
 {provider:'sportmonks',statusKey:'sportmonks',title:'Sportmonks',caption:'Fonte calcistica',text:'Calendario e storico per il modello. Piano attivo: Starter + 1 lega extra, 6 competizioni: Serie A, Premier League, La Liga, Bundesliga, Ligue 1 e Coppa Italia.',plan:'Starter + 1 extra · 6 competizioni',price:'33 EUR / mese',portal:'https://my.sportmonks.com/api/tokens',pricing:'https://www.sportmonks.com/football-api/plans-pricing/'},
 {provider:'the-odds-api',statusKey:'odds',title:'The Odds API',caption:'Confronto quote e mercati',text:'Quote dei bookmaker con fonte e aggiornamento. Risultati esatti, corner e cartellini compaiono solo quando disponibili per quella partita.',plan:'20K · 20.000 crediti al mese',price:'30 USD / mese',portal:'https://dash.the-odds-api.com/',pricing:'https://the-odds-api.com/'}
];
export default function Connections(){
  const [status,setStatus]=useState<Status|null>(null),[error,setError]=useState('');
  useEffect(()=>{fetch('/api/connections',{cache:'no-store'}).then(async r=>{const d=await r.json() as Status;setStatus(d);if(d.error)setError(d.error);}).catch(()=>setError('Collegamento non disponibile. Ricarica la pagina.'));},[]);
  return <main className="connections-page"><a href="/" className="connections-brand"><svg viewBox="0 0 64 64" fill="none" aria-hidden="true" className="brand-mark"><circle cx="30" cy="30" r="19" stroke="currentColor" strokeWidth="5"/><path d="M11 30h38" stroke="currentColor" strokeWidth="1.6" strokeOpacity=".45"/><circle cx="30" cy="30" r="4.2" fill="currentColor"/><path d="M40 40 51 51" stroke="currentColor" strokeWidth="6" strokeLinecap="round"/><circle cx="56.5" cy="56.5" r="2.6" fill="currentColor" fillOpacity=".55"/></svg>QUORUM <span>FOOTBALL LAB</span></a><div className="connections-hero"><span className="secure-label"><LockKeyhole size={15}/> SPAZIO PRIVATO</span><h1>Colleghiamo il tuo<br/><em>laboratorio.</em></h1><p>L’intelligenza interpreta i risultati. I dati alimentano il modello. Qui configuri entrambi, un passaggio alla volta.</p></div>
  {error&&<p role="alert" className="connection-error">{error}</p>}
  {!status&&!error&&<p role="status">Caricamento dei collegamenti…</p>}
  {status&&!status.authenticated&&<section className="panel"><h2>Accesso non verificato</h2><p>QUORUM non ha ricevuto un’identità valida per questa sessione. Ricarica la pagina: ti verrà chiesto di accedere con la tua email autorizzata.</p><a className="primary" href="/collegamenti">Ricarica e accedi</a></section>}
  {status?.authenticated&&!status.admin&&<section className="panel"><h2>Configurazione del proprietario</h2><p>Il tuo account ({status.email}) può consultare lo stato. Le chiavi si configurano con l’account del proprietario di QUORUM.</p><a href="/">Torna al laboratorio</a></section>}
  {status?.admin&&<><div className="connections-cards">{providers.map(config=><CredentialCard key={config.provider} config={config} connected={status[config.statusKey]} status={status} onSaved={setStatus}/>)}</div><section className="panel subscription-note"><h3>Piani mensili, acquisto diretto.</h3><p>Configurazione scelta: Sportmonks Starter + 1 lega extra (6 competizioni) + The Odds API 20K. Totale dei listini base: 33 EUR + 30 USD al mese, oltre al consumo OpenAI, eventuali imposte e cambio. I prezzi e le condizioni finali sono quelli del checkout del fornitore.</p><p>Coppe europee e nazionali sono fuori perimetro: con Sportmonks si aggiungono come leghe extra. Gli extra come xG e Predictions hanno costi separati e non vengono abilitati automaticamente. API-Football non è usato: dai server condivisi di Cloudflare il piano Free rischia blocchi e sospensioni.</p><p>Nessun abbonamento è stato acquistato da QUORUM. Dopo l’acquisto incolla le rispettive chiavi nei campi protetti. Il solo abbonamento non conferma la disponibilità di ogni statistica o mercato.</p><a href="/quote" className="secondary">Apri il confronto quote</a></section><section className="connection-explainer"><ShieldCheck size={23}/><div><h3>Le tue chiavi restano in questo spazio.</h3><p>La chiave viene cifrata nel browser e conservata cifrata sul server di QUORUM. Il server la decifra solo per contattare il fornitore. Non viene salvata nella memoria del browser, mostrata ad altri utenti o inviata in chat.</p><p>Con “Verifica e collega” autorizzi questo salvataggio. La verifica OpenAI legge l’elenco dei modelli ed esegue una richiesta reale minima (pochi token, costo trascurabile) per dimostrare che le analisi funzionano. Le spiegazioni AI successive consumano credito API: massimo 20 richieste al giorno per questo laboratorio.</p><p>ChatGPT e le API hanno fatturazione separata. Il collegamento di un fornitore non dimostra la precisione del modello o un rendimento.</p></div></section><a href="/" className="secondary">Entra nel laboratorio</a></>}
  </main>;
}
function DiagnosisView({d}:{d:Diagnosis}){
  return <div className="diagnosis" aria-live="polite"><p className="diagnosis-title">{d.usable?<><Check size={15}/> Analisi AI utilizzabili</>:<><CircleAlert size={15}/> Analisi AI non ancora utilizzabili</>}<span>modello {d.model}</span></p><ol>{d.steps.map(s=><li key={s.step} className={s.ok?'ok':'ko'}><span className="diagnosis-icon">{s.ok?<Check size={13}/>:<X size={13}/>}</span><div><strong>{s.label}</strong>{s.detail&&<p>{s.detail}</p>}{s.error&&<p>{s.error}</p>}{(s.upstreamStatus||s.code||s.requestId)&&<code>{[s.upstreamStatus&&'HTTP '+s.upstreamStatus,s.code,s.type,s.requestId&&'rif. '+s.requestId].filter(Boolean).join(' · ')}</code>}</div></li>)}</ol>{d.modelListed===false&&d.visibleModels.length>0&&<p className="diagnosis-models">Modelli visibili al progetto: {d.visibleModels.slice(0,12).join(', ')}</p>}<small>Controllo del {new Date(d.checkedAt).toLocaleString('it-IT',{timeZone:'Europe/Rome'})}</small></div>;
}
function CredentialCard({config,connected,status,onSaved}:{config:typeof providers[number];connected:boolean;status:Status;onSaved:(s:Status)=>void}){
  const {provider,title,caption}=config;
  const [value,setValue]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(''),[diagnosis,setDiagnosis]=useState<Diagnosis|null>(null);
  function apply(d:any){
    if(d.diagnosis)setDiagnosis(d.diagnosis);
    if(d.saved)onSaved({...status,openai:d.openai,football:d.football,sportmonks:d.sportmonks,odds:d.odds});
  }
  async function connect(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault();setError('');setMessage('');setDiagnosis(null);
    if(!status.publicKey||!status.recipientId){setError('Configurazione protetta non disponibile. Ricarica la pagina.');return;}
    if(!validCredential(value.trim(),provider)){setError('Controlla di aver copiato la chiave completa, senza spazi.');return;}
    setBusy(true);
    try{
      const ciphertext=await sealCredential(value.trim(),status.publicKey,provider,status.recipientId);setValue('');
      const r=await fetch('/api/connections',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider,ciphertext,recipientId:status.recipientId})});
      const d=await r.json() as any;apply(d);
      if(!r.ok&&!d.saved)throw new Error(d.error||'Collegamento non riuscito.');
      setMessage(d.message||d.error);
    }catch(e){setError(e instanceof Error?e.message:'Collegamento non riuscito.');}finally{setBusy(false);}
  }
  async function recheck(){
    setError('');setMessage('');setBusy(true);
    try{
      const r=await fetch('/api/connections',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:'openai',recheck:true})});
      const d=await r.json() as any;apply(d);
      if(!d.diagnosis)throw new Error(d.error||'Controllo non riuscito.');
      setMessage(d.message);
    }catch(e){setError(e instanceof Error?e.message:'Controllo non riuscito.');}finally{setBusy(false);}
  }
  return <section className="panel credential-card"><div className="credential-heading"><span className="credential-symbol"><KeyRound size={23}/></span><span className={'connection-badge '+(connected?'connected':'')}>{connected?<><Check size={14}/> CHIAVE SALVATA</>:'DA COLLEGARE'}</span></div><p className="eyebrow">{caption}</p><h2>{title}</h2><p>{config.text}</p><div className="provider-plan"><strong>{config.price}</strong><span>{config.plan}</span><a href={config.pricing} target="_blank" rel="noreferrer">Piano e attivazione</a></div><form onSubmit={connect}><label htmlFor={'key-'+provider}>{connected?'Sostituisci la chiave':'Chiave API'}<input id={'key-'+provider} type="password" autoComplete="off" autoCapitalize="none" spellCheck={false} value={value} onChange={e=>setValue(e.target.value)} required maxLength={400} placeholder={provider==='openai'?'sk-proj-…':'La chiave del tuo account'} disabled={busy||!status.securityReady}/></label>{provider==='openai'&&<small>Permesso necessario: Model capabilities → Responses → Request. Utile ma non obbligatorio: List models → Read.</small>}<button className="primary" disabled={busy||!value||!status.securityReady}>{busy?<><LoaderCircle size={17} className="spin"/> Verifica in corso…</>:<><LockKeyhole size={16}/>Verifica e collega</>}</button>{provider==='openai'&&connected&&<button type="button" className="secondary" onClick={recheck} disabled={busy}><RefreshCw size={15}/> Ricontrolla la chiave salvata</button>}</form>{diagnosis&&<DiagnosisView d={diagnosis}/>}{message&&<p role="status" className={diagnosis&&!diagnosis.usable?'connection-error':'connection-success'}>{message}</p>}{error&&<p role="alert" className="connection-error">{error}</p>}{!status.securityReady&&<p role="alert" className="connection-error">La configurazione protetta del server non è ancora disponibile.</p>}<a className="credential-provider-link" href={config.portal} target="_blank" rel="noreferrer">Apri il portale {title}</a></section>;
}

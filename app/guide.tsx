'use client';
import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Expand, X } from 'lucide-react';

type Slide = { img?: string; eyebrow: string; title: string; text: string; how: string[]; tip?: string; go?: string; goLabel?: string };

const SLIDES: Slide[] = [
  { img: '01-panoramica', eyebrow: 'BENVENUTO', title: 'QUORUM in 30 secondi', text: 'QUORUM analizza ogni giorno le partite di Serie A, Premier League, La Liga, Bundesliga, Ligue 1 e Coppa Italia. Unisce le statistiche delle squadre alle quote dei bookmaker e ti dice cosa è probabile, cosa conviene giocare e quanto puntare.',
    how: ['Ogni 3 ore scarica calendario, statistiche, infortuni e quote: non devi fare nulla.', 'La tua routine: Pronostici → Valore → Schedine → registra nel Portafoglio.', 'A fine partita QUORUM segna da solo vinte e perse e aggiorna il tuo capitale.', 'Dal telefono: aggiungi QUORUM alla schermata Home e usala come un’app.'],
    tip: 'Nessun modello indovina sempre. QUORUM ti dà un vantaggio di metodo: probabilità misurate, valore delle quote e gestione del capitale.' },
  { img: '02-pronostici', eyebrow: 'PRONOSTICI', title: 'Le partite della settimana, lette dai numeri', text: 'È la pagina principale: tutte le partite dei prossimi 7 giorni, raggruppate per giorno, ognuna con il suo pronostico. In alto trovi l’affidabilità misurata del modello sulle partite già giocate.',
    how: ['Filtra per campionato con i pulsanti sopra le partite.', 'Leggi “Affidabilità misurata”: un pronostico dato al 65% negli ultimi mesi è stato preso il 62% delle volte.', '“Aggiorna ora” ricalcola subito (le quote si riscaricano solo se hanno più di 30 minuti).'],
    tip: 'Più la percentuale è alta, più il pronostico è solido, ma più la quota è bassa. L’affidabilità ti dice quanto fidarti.', go: 'predictions', goLabel: 'Apri i Pronostici' },
  { img: '03-scheda-partita', eyebrow: 'PRONOSTICI · LA SCHEDA', title: 'Cosa c’è in ogni partita', text: 'In alto il pronostico principale con la probabilità e l’etichetta di fiducia (Alta ≥ 60%, Media ≥ 48%, Bassa sotto). Sotto, tutti i mercati principali e quelli speciali.',
    how: ['Segno 1X2, doppia chance, Over/Under 2,5, Goal/No Goal, risultato più probabile.', 'Gol attesi: quanti gol il modello si aspetta da ogni squadra.', 'Corner e cartellini attesi, con la linea del bookmaker più vicina e la sua quota.', 'Rigori: probabilità che venga assegnato un rigore e che venga sbagliato.', 'Marcatori: i giocatori più probabili, con la quota reale quando disponibile (q).'],
    tip: '“Quota equa” è la quota giusta secondo QUORUM: se il bookmaker paga di più, c’è valore.' },
  { img: '04-contesto', eyebrow: 'PRONOSTICI · IL CONTESTO', title: 'Classifica, forma e indisponibili', text: 'Ogni scheda mostra il contesto che conta prima di giocare: posizione e punti in classifica, le ultime 5 partite e i giocatori fuori per infortunio o squalifica.',
    how: ['Forma: quadratini V (vinta), N (pareggio), P (persa), dal più recente.', 'Indisponibili: nome e motivo. I marcatori infortunati sono già esclusi dal calcolo.', '“Mercato: in linea con le statistiche” = modello e bookmaker concordano. Se si discostano molto, controlla formazioni e notizie.', '“Tutti i mercati della partita” apre il Centro partita.'],
    tip: 'Un’assenza pesante (bomber, portiere titolare) non è ancora pesata nel numero: è lì perché tu la valuti.' },
  { img: '15-centro-partita', eyebrow: 'CENTRO PARTITA', title: 'Tutti i mercati e la tua giocata', text: 'Il Centro partita mostra ogni mercato con probabilità e quota equa. A destra costruisci la tua ipotesi e la registri nel portafoglio.',
    how: ['Clicca un esito: a destra compaiono probabilità e quota equa.', 'Scrivi la quota del tuo bookmaker: QUORUM calcola il valore atteso.', 'Inserisci l’importo (ti propone quello del tuo profilo) e premi “Registra”.', 'Schede: Mercati, Risultati esatti, Corner e cartellini, Logica del modello, Analista AI.'],
    tip: 'Gioca solo se la quota del tuo bookmaker è più alta della quota equa: è l’unico modo per guadagnare nel lungo periodo.' },
  { img: '16-corner-tab', eyebrow: 'CENTRO PARTITA · CORNER E CARTELLINI', title: 'Linee su corner, cartellini e gol per squadra', text: 'Scegli statistica (corner, gialli, rossi, gol) e squadra (totale, casa, ospite): vedi la probabilità di ogni linea Over/Under.',
    how: ['Le medie sono calcolate su ~13 mesi di partite, tenendo conto dell’avversario.', 'Cerca le linee vicine alla media attesa: lì le probabilità sono più informative.', 'Confronta con la quota del bookmaker prima di giocare.'] },
  { img: '07-valore', eyebrow: 'VALORE', title: 'Dove la quota paga più del dovuto', text: 'Lo scanner confronta ogni esito con le quote di decine di bookmaker europei. Una “value bet” è un esito che il bookmaker paga più di quanto vale secondo QUORUM.',
    how: ['Stima QUORUM = 35% statistiche + 65% consenso del mercato (senza margine): più prudente del solo modello.', 'Valore = stima × quota migliore − 1. +5% significa che, nel lungo periodo, ogni 100 € giocati rendono 5 €.', '“Supera i controlli QUORUM”: valore ≥ 3%, quota ≤ 4,50, almeno 5 bookmaker, modello vicino al mercato.', 'Le altre sono visibili con il motivo dell’attenzione: decidi tu.'],
    tip: 'Il valore si vede su tante giocate, non sulla singola. Per questo conta la puntata giusta.', go: 'value', goLabel: 'Apri Valore' },
  { img: '05-bomba', eyebrow: 'SCHEDINE · BOMBA DELLA SETTIMANA', title: 'Quota alta per sbancare', text: '5–8 esiti scelti tra le partite della settimana, quota totale tra 50 e 200. QUORUM sceglie la combinazione più probabile per quella quota, usando solo esiti con almeno il 45% e mai contro il mercato.',
    how: ['Viene salvata una volta a settimana e regolata in automatico.', 'La puntata indicativa è piccola apposta: è una giocata da sogno.', '“Analizza nel Laboratorio” mostra tutti gli scenari possibili.'],
    tip: 'Con il 3% di probabilità entra in media una volta ogni 30. Giocala con soldi che consideri già spesi.', go: 'tickets', goLabel: 'Apri Schedine' },
  { img: '06-multiple', eyebrow: 'SCHEDINE · MULTIPLE', title: 'Multiple pronte, ognuna con il suo scopo', text: 'Ogni giorno QUORUM compone le multiple dalle partite della settimana, sempre con un solo esito per partita.',
    how: ['Raddoppio in multipla: 2–3 esiti molto probabili che insieme fanno circa quota 2.', 'Multipla prudente: 3–4 esiti solidi, quota 2,5–4.', 'Multipla di valore: solo esiti con valore positivo.', 'Multipla quota 10: da 3 o da 5 esiti, quota totale 10–13, la combinazione più probabile in quella fascia.', 'Multipla più probabile: 3, 4 o 5 esiti con la probabilità più alta.', 'Per ognuna: quota totale, probabilità, valore e bookmaker con la quota migliore.'],
    tip: 'Ogni partita in più moltiplica il margine del bookmaker. Le multiple corte sono le più sostenibili.' },
  { img: '09-raddoppi', eyebrow: 'SCHEDINE · RADDOPPI', title: 'Raddoppia con la singola', text: 'Singole a quota circa 2 (1,80–2,40): se vincono raddoppi la puntata. Sono ordinate per valore, poi per probabilità.',
    how: ['Una sola partita: nessun rischio che un altro risultato rovini la schedina.', 'Le prime 3 del giorno vengono salvate e misurate nei Risultati.', 'Puntata indicativa già calcolata sul tuo budget.'] },
  { img: '17-laboratorio', eyebrow: 'LABORATORIO', title: 'Metti alla prova una schedina', text: 'Carica una schedina QUORUM o costruiscine una tua (fino a 8 partite) e confronta singole, multipla e sistemi.',
    how: ['Modifica le quote con quelle del tuo bookmaker.', 'Scegli il tipo di sistema e la puntata per combinazione.', 'Leggi probabilità di profitto, costo, perdita massima e valore atteso netto.'],
    tip: 'Se il valore atteso è negativo, più combinazioni non lo rendono positivo: aumentano solo il costo.', go: 'lab', goLabel: 'Apri il Laboratorio' },
  { img: '08-risultati', eyebrow: 'RISULTATI', title: 'Regolamento automatico e rendimento reale', text: 'Ogni 3 ore QUORUM controlla le partite finite e segna da solo vinte, perse o rimborsate: le tue giocate, le value bet e le schedine proposte.',
    how: ['Value bet: percentuale presa, profitto e ROI con 1 unità a giocata, per mercato.', 'Schedine: rendimento per tipo (raddoppi, multiple, Bomba).', 'Ultime schedine con lo stato: in corso, vinta, persa.', 'Partite rinviate oltre 3 giorni o annullate = rimborso.'],
    tip: 'Guarda il ROI dopo almeno 100 giocate: prima è soprattutto fortuna o sfortuna.', go: 'results', goLabel: 'Apri i Risultati' },
  { img: '10-mm-regole', eyebrow: 'MONEY MANAGEMENT', title: 'Giochi come vuoi. Con un metodo resti in gioco.', text: 'Il money management non decide cosa giochi: decide quanto. Anche il pronostico migliore perde spesso: con le puntate giuste una serie negativa è un incidente, senza regole è la fine del conto.',
    how: ['1 · Banca dedicata: solo soldi che puoi permetterti di perdere.', '2 · Puntata in percentuale della banca di oggi: quando perdi punti meno, quando vinci punti di più.', '3 · Limiti e stop: un tetto alle perdite del giorno e uno stop se la banca scende troppo.'],
    tip: 'Mai rincorrere le perdite raddoppiando la puntata: è il modo più veloce per bruciare un conto.', go: 'portfolio', goLabel: 'Apri il Portafoglio' },
  { img: '11-mm-budget', eyebrow: 'MONEY MANAGEMENT · BUDGET', title: 'Il tuo budget, le tue puntate', text: 'Scrivi quanto vuoi dedicare alle scommesse: QUORUM consiglia il profilo adatto e calcola tutte le puntate in euro, rispettando la giocata minima di 2 €.',
    how: ['Da 1.000 € in su: Prudente (1%). Da 100 a 999 €: Equilibrato (2%). Da 40 a 99 €: Aggressivo (5%).', 'La simulazione mostra 300 giocate per ogni profilo, partendo dal tuo budget.', 'Guarda la colonna rossa “Senza regole”: anche con un buon metodo, più di una volta su tre brucia il conto.'] },
  { img: '12-mm-profili', eyebrow: 'MONEY MANAGEMENT · PROFILI', title: 'Scegli il profilo con un clic', text: 'Ogni profilo mostra la puntata in euro, il tetto delle perdite giornaliere e la soglia dello stop. Un clic e i limiti sono impostati.',
    how: ['Il badge “consigliato” indica il profilo adatto al tuo budget.', 'Se un profilo scende sotto i 2 € a giocata, la scheda lo segnala.', 'Sotto: capitale virtuale, ROI, drawdown massimo e operazioni chiuse.'] },
  { img: '13-mm-limiti', eyebrow: 'PORTAFOGLIO · DIARIO E LIMITI', title: 'Diario delle giocate e regole personalizzate', text: 'Il diario registra ogni giocata con la quota e la probabilità del momento. A destra puoi attivare o disattivare le regole e personalizzare i limiti.',
    how: ['Le giocate si regolano da sole a fine partita; puoi anche segnarle a mano.', 'Regole attive: QUORUM blocca le giocate oltre i limiti. Disattivate: valgono solo come riferimento.', 'Esporta il diario in CSV quando vuoi.', 'Puoi creare più portafogli, ognuno con il suo nome e budget.'] },
  { img: '14-partite', eyebrow: 'PARTITE', title: 'Il calendario giorno per giorno', text: 'Scegli una data e una competizione: vedi tutte le partite in programma e apri il Centro partita di ognuna.',
    how: ['Cerca una squadra con il campo di ricerca.', 'Clicca una partita per l’analisi completa.', 'Utile per giocare una partita che non è tra i pronostici in evidenza.'], go: 'matches', goLabel: 'Apri le Partite' },
  { img: '18-collegamenti', eyebrow: 'COLLEGAMENTI E TELEFONO', title: 'Dati, chiavi e app sul telefono', text: 'QUORUM usa Sportmonks (calendario, statistiche, infortuni), The Odds API (quote) e OpenAI (analista AI). Le chiavi sono cifrate e restano sul server di QUORUM.',
    how: ['Collegamenti: stato e aggiornamento delle chiavi (solo amministratore).', 'Android: Chrome → menu → “Installa app” o “Aggiungi a schermata Home”.', 'iPhone: Safari → Condividi → “Aggiungi alla schermata Home”.', 'L’accesso resta attivo a lungo: non serve rifare il login ogni giorno.'] },
  { eyebrow: 'GLOSSARIO', title: 'Le parole di QUORUM', text: 'I termini che trovi nell’app, spiegati in una riga.',
    how: ['Quota equa: 1 ÷ probabilità. La quota giusta, senza margine del bookmaker.', 'Valore: quanto la quota offerta supera quella equa. Positivo = conveniente nel lungo periodo.', 'Fiducia: Alta ≥ 60%, Media ≥ 48%, Bassa sotto.', 'Gol attesi: i gol che il modello si aspetta da ogni squadra.', 'Kelly (¼): formula che dimensiona la puntata in base al valore; QUORUM ne usa un quarto, massimo 2%.', 'Drawdown: quanto è sceso il capitale dal suo massimo.', 'Backtest: il modello provato sulle partite passate senza conoscere i risultati.', 'ROI: profitto diviso per il totale giocato.'],
    tip: 'Gioca responsabilmente: solo maggiorenni, solo con soldi che puoi permetterti di perdere.' },
];

export function GuideView({ onGo }: { onGo: (view: string) => void }) {
  const [i, setI] = useState(0), [zoom, setZoom] = useState(false);
  const s = SLIDES[i], last = SLIDES.length - 1;
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (zoom && e.key === 'Escape') setZoom(false); if (e.key === 'ArrowRight') setI(x => Math.min(last, x + 1)); if (e.key === 'ArrowLeft') setI(x => Math.max(0, x - 1)); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [zoom, last]);
  return <>
    <div className="page-heading"><div><p className="eyebrow">GUIDA</p><h1>Come si usa QUORUM<span>.</span></h1><p>Ogni funzione spiegata con le schermate reali. Usa le frecce o i tasti ← →.</p></div></div>
    <section className="guide">
      <div className="guide-progress">{SLIDES.map((x, k) => <button key={k} className={k === i ? 'on' : k < i ? 'done' : ''} onClick={() => setI(k)} aria-label={'Slide ' + (k + 1) + ': ' + x.title} title={x.title} />)}</div>
      <div className={'guide-slide' + (s.img ? '' : ' text-only')}>
        {s.img && <button className="guide-img" onClick={() => setZoom(true)} aria-label="Ingrandisci immagine"><img src={'/guide/' + s.img + '.jpg'} alt={'Schermata: ' + s.title} loading="lazy" /><span><Expand size={14} />Ingrandisci</span></button>}
        <div className="guide-text">
          <p className="eyebrow">{s.eyebrow} · {i + 1}/{SLIDES.length}</p>
          <h2>{s.title}</h2>
          <p>{s.text}</p>
          <ul>{s.how.map(h => <li key={h}>{h}</li>)}</ul>
          {s.tip && <p className="guide-tip"><BookOpen size={15} />{s.tip}</p>}
          {s.go && <button className="secondary" onClick={() => onGo(s.go!)}>{s.goLabel}<ArrowRight size={15} /></button>}
        </div>
      </div>
      <div className="guide-nav">
        <button className="secondary" disabled={i === 0} onClick={() => setI(i - 1)}><ArrowLeft size={16} />Indietro</button>
        <span>{i + 1} / {SLIDES.length}</span>
        {i < last ? <button className="primary" onClick={() => setI(i + 1)}>Avanti<ArrowRight size={16} /></button> : <button className="primary" onClick={() => onGo('predictions')}>Inizia dai Pronostici<ArrowRight size={16} /></button>}
      </div>
    </section>
    {zoom && s.img && <div className="guide-zoom" onClick={() => setZoom(false)} role="dialog" aria-label="Immagine ingrandita"><button className="icon-button" aria-label="Chiudi"><X size={22} /></button><img src={'/guide/' + s.img + '.jpg'} alt={'Schermata: ' + s.title} /></div>}
  </>;
}

'use client';
import { useEffect, useMemo, useState } from 'react';
import { Info, RefreshCw, Shirt, Trophy } from 'lucide-react';

type Row = { position: number; teamId: number; name: string; logo: string | null; played: number | null; won: number | null; draw: number | null; lost: number | null; gf: number | null; ga: number | null; points: number; form: string };
type League = { league: string; flag: string; rows: Row[]; source: 'ufficiale' | 'calcolata'; error?: string };
type Fx = { id: string; competition: string; kickoff: string; state: string; home: string; away: string; homeLogo: string | null; awayLogo: string | null };
type Player = { name: string; number: number | null; field: string | null; pos: string | null; photo: string | null };
type Side = { name: string; logo: string | null; formation: string | null; starters: Player[]; bench: Player[]; coach: string | null };
type Lineup = { id: string; competition: string; kickoff: string; state: string; home: Side | null; away: Side | null; confirmed: boolean; error?: string };

const isRoma = (n: string) => /^(as )?roma$/i.test(n.trim());
const isJuve = (n: string) => /juventus/i.test(n);
const fam = (n: string) => isRoma(n) ? ' fav-roma' : isJuve(n) ? ' fav-juve' : '';
const when = (s: string) => new Date(s).toLocaleString('it-IT', { timeZone: 'Europe/Rome', weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const dayOf = (s: string) => new Date(s).toLocaleDateString('it-IT', { timeZone: 'Europe/Rome', weekday: 'long', day: 'numeric', month: 'long' });
const get = async (q: string): Promise<any> => { const r = await fetch('/api/scanner?view=' + q, { cache: 'no-store' }); const d: any = await r.json(); if (!r.ok || d.error) throw new Error(d.error || 'Dati non disponibili.'); return d; };

export function Crest({ src, name, size = 28 }: { src: string | null; name: string; size?: number }) {
  const [bad, setBad] = useState(false);
  return src && !bad ? <img className="crest" src={src} alt={name} width={size} height={size} loading="lazy" onError={() => setBad(true)} />
    : <span className="crest crest-fallback" style={{ width: size, height: size, fontSize: size * 0.38 }}>{name.slice(0, 3).toUpperCase()}</span>;
}

function Form({ f }: { f: string }) {
  return <span className="form-dots">{f.split('').slice(-5).map((c, i) => <i key={i} className={c === 'W' || c === 'V' ? 'w' : c === 'D' || c === 'N' ? 'd' : 'l'} title={c} />)}</span>;
}

// Emiliano (Roma) and Valerio (Juve): the family derby on top of every table.
function FamilyDerby({ serieA }: { serieA?: League }) {
  const roma = serieA?.rows.find(r => isRoma(r.name)), juve = serieA?.rows.find(r => isJuve(r.name));
  if (!roma && !juve) return null;
  const gap = roma && juve ? roma.points - juve.points : null;
  const tile = (r: Row | undefined, who: string, cls: string, fallback: string) => <div className={'derby-tile ' + cls}>
    <div className="derby-crest">{r ? <Crest src={r.logo} name={r.name} size={84} /> : <span className="crest crest-fallback" style={{ width: 84, height: 84 }}>{fallback}</span>}</div>
    <small>{who}</small><b>{r?.name || fallback}</b>
    {r && <div className="derby-stats"><span><em>{r.position}°</em>posto</span><span><em>{r.points}</em>punti</span></div>}
    {r?.form && <Form f={r.form} />}
  </div>;
  return <section className="family-derby">
    {tile(roma, 'Emiliano', 'roma', 'Roma')}
    <div className="derby-mid"><span className="derby-vs">VS</span><p>Derby di famiglia</p>
      {gap !== null && <strong>{gap === 0 ? 'Appaiate' : (gap > 0 ? 'Roma +' + gap : 'Juve +' + -gap)}</strong>}
      {gap !== null && <small>{gap === 0 ? 'stessi punti in Serie A' : 'punti di vantaggio in Serie A'}</small>}</div>
    {tile(juve, 'Valerio', 'juve', 'Juventus')}
  </section>;
}

export function StandingsView() {
  const [d, setD] = useState<{ leagues: League[] } | null>(null), [err, setErr] = useState(''), [tab, setTab] = useState('Serie A');
  useEffect(() => { get('standings').then(setD, e => setErr(e.message)); }, []);
  const lg = d?.leagues.find(l => l.league === tab), n = lg?.rows.length || 20;
  const zone = (p: number) => p <= 4 ? 'z-cl' : p <= 6 ? 'z-el' : p > n - 3 ? 'z-down' : '';
  return <div className="page football-page">
    <div className="page-head"><div><p className="eyebrow">CLASSIFICHE</p><h1><Trophy className="h1-icon" />Classifiche dei campionati</h1><p>Le classifiche ufficiali di Serie A, Premier League, La Liga, Bundesliga e Ligue 1, con la forma delle ultime cinque partite.</p></div></div>
    {err ? <div className="empty"><span className="empty-icon"><Info /></span><h3>Classifiche non disponibili</h3><p>{err}</p></div>
      : !d ? <div className="empty"><span className="empty-icon"><RefreshCw className="spin" /></span><h3>Carico le classifiche…</h3></div>
      : <>
        <FamilyDerby serieA={d.leagues.find(l => l.league === 'Serie A')} />
        <div className="league-tabs">{d.leagues.map(l => <button key={l.league} className={tab === l.league ? 'on' : ''} onClick={() => setTab(l.league)}><span>{l.flag}</span>{l.league}</button>)}</div>
        {lg && (lg.rows.length ? <div className="standings-card">
          <table className="standings">
            <thead><tr><th>#</th><th className="t-team">Squadra</th><th>PG</th><th className="hide-sm">V</th><th className="hide-sm">N</th><th className="hide-sm">P</th><th className="hide-sm">Gol</th><th>DR</th><th>Pt</th><th className="hide-xs">Forma</th></tr></thead>
            <tbody>{lg.rows.map(r => <tr key={r.teamId} className={zone(r.position) + fam(r.name)}>
              <td><span className="pos">{r.position}</span></td>
              <td className="t-team"><Crest src={r.logo} name={r.name} size={24} /><span>{r.name}</span></td>
              <td>{r.played ?? '—'}</td><td className="hide-sm">{r.won ?? '—'}</td><td className="hide-sm">{r.draw ?? '—'}</td><td className="hide-sm">{r.lost ?? '—'}</td>
              <td className="hide-sm">{r.gf !== null && r.ga !== null ? r.gf + ':' + r.ga : '—'}</td>
              <td>{r.gf !== null && r.ga !== null ? (r.gf - r.ga > 0 ? '+' : '') + (r.gf - r.ga) : '—'}</td>
              <td><b>{r.points}</b></td><td className="hide-xs">{r.form ? <Form f={r.form} /> : '—'}</td></tr>)}</tbody>
          </table>
          <p className="legend-zones"><span className="z-cl">Champions</span><span className="z-el">Europa</span><span className="z-down">Retrocessione</span>{lg.source === 'calcolata' && <span>Classifica ricostruita dai risultati: il piano dati non fornisce quella ufficiale.</span>}</p>
        </div> : <p className="small-note">{lg.error || 'Classifica non disponibile per questo campionato.'}</p>)}
      </>}
  </div>;
}

function Pitch({ l }: { l: Lineup }) {
  // formation_field "riga:colonna": riga 1 = portiere. Casa in basso, ospiti in alto.
  const place = (players: Player[], home: boolean) => {
    const parsed = players.map((p, i) => { const [r, c] = (p.field || '').split(':').map(Number); return { p, r: Number.isFinite(r) && r > 0 ? r : (i === 0 ? 1 : 2 + Math.floor((i - 1) / 4)), c: Number.isFinite(c) && c > 0 ? c : ((i - 1) % 4) + 1 }; });
    const rows = Math.max(...parsed.map(x => x.r), 1);
    return parsed.map(x => { const inRow = parsed.filter(y => y.r === x.r).sort((a, b) => a.c - b.c), k = inRow.indexOf(x);
      const xPct = ((k + 1) / (inRow.length + 1)) * 100, depth = rows === 1 ? 0 : (x.r - 1) / (rows - 1), yPct = home ? 93 - depth * 40 : 7 + depth * 40;
      return <div key={(home ? 'h' : 'a') + x.p.name} className={'pl ' + (home ? 'home' : 'away')} style={{ left: (home ? xPct : 100 - xPct) + '%', top: yPct + '%' }}><span>{x.p.number ?? ''}</span><small>{x.p.name.split(' ').slice(-1)[0]}</small></div>; });
  };
  return <div className="pitch"><i className="pitch-mid" /><i className="pitch-circle" /><i className="pitch-box top" /><i className="pitch-box bottom" />
    {l.away && place(l.away.starters, false)}{l.home && place(l.home.starters, true)}</div>;
}

function LineupDetail({ id }: { id: string }) {
  const [l, setL] = useState<Lineup | null>(null), [err, setErr] = useState('');
  useEffect(() => { let alive = true; const load = () => get('lineup&id=' + id).then(x => { if (alive) setL(x); }, e => alive && setErr(e.message)); load(); const t = setInterval(load, 120000); return () => { alive = false; clearInterval(t); }; }, [id]);
  if (err) return <p className="small-note">{err}</p>;
  if (!l) return <p className="small-note"><RefreshCw size={13} className="spin" /> Carico le formazioni…</p>;
  const team = (s: Side | null, cls: string) => s && <div className={'lu-team ' + cls}><div className="lu-head"><Crest src={s.logo} name={s.name} size={34} /><div><b>{s.name}</b><small>{s.formation ? 'Modulo ' + s.formation : 'Modulo non ancora comunicato'}{s.coach ? ' · All. ' + s.coach : ''}</small></div></div>
    {s.starters.length > 0 && <ol className="lu-list">{s.starters.map(p => <li key={p.name}><span>{p.number ?? '–'}</span>{p.name}{p.pos && <em>{p.pos}</em>}</li>)}</ol>}
    {s.bench.length > 0 && <details className="lu-bench"><summary>Panchina ({s.bench.length})</summary><ul>{s.bench.map(p => <li key={p.name}><span>{p.number ?? '–'}</span>{p.name}</li>)}</ul></details>}</div>;
  return <div className="lineup-detail">
    <div className={'lu-status' + (l.confirmed ? ' ok' : '')}>{l.confirmed ? '✓ Formazioni ufficiali' : '⏳ Non ancora ufficiali: escono di solito 60 minuti prima del calcio d’inizio. La pagina si aggiorna da sola ogni 2 minuti.'}</div>
    {l.confirmed && <Pitch l={l} />}
    <div className="lu-teams">{team(l.home, 'home')}{team(l.away, 'away')}</div>
  </div>;
}

export function LineupsView() {
  const [fx, setFx] = useState<Fx[] | null>(null), [err, setErr] = useState(''), [open, setOpen] = useState<string | null>(null);
  useEffect(() => { get('lineups-list').then(d => setFx(d.fixtures), e => setErr(e.message)); }, []);
  const list = useMemo(() => (fx || []).filter(f => !['FT', 'AET', 'FT_PEN', 'CANCL', 'POSTP'].includes(f.state)), [fx]);
  const family = list.filter(f => fam(f.home) || fam(f.away));
  const days = [...new Set(list.map(f => dayOf(f.kickoff)))];
  const card = (f: Fx) => <article key={f.id} className={'lu-card' + fam(f.home) + fam(f.away) + (open === f.id ? ' open' : '')}>
    <button className="lu-row" onClick={() => setOpen(open === f.id ? null : f.id)}>
      <span className="lu-side"><Crest src={f.homeLogo} name={f.home} size={30} /><b>{f.home}</b></span>
      <span className="lu-mid"><small>{f.competition}</small><em>{f.state === 'NS' ? new Date(f.kickoff).toLocaleTimeString('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' }) : 'LIVE'}</em></span>
      <span className="lu-side right"><b>{f.away}</b><Crest src={f.awayLogo} name={f.away} size={30} /></span>
    </button>
    {open === f.id && <LineupDetail id={f.id} />}
  </article>;
  return <div className="page football-page">
    <div className="page-head"><div><p className="eyebrow">FORMAZIONI</p><h1><Shirt className="h1-icon" />Formazioni ufficiali</h1><p>Le partite di oggi e dei prossimi due giorni. Tocca una partita per vedere gli undici in campo, il modulo e la panchina appena vengono comunicati.</p></div></div>
    {err ? <div className="empty"><span className="empty-icon"><Info /></span><h3>Formazioni non disponibili</h3><p>{err}</p></div>
      : !fx ? <div className="empty"><span className="empty-icon"><RefreshCw className="spin" /></span><h3>Carico le partite…</h3></div>
      : !list.length ? <div className="empty"><span className="empty-icon"><Shirt /></span><h3>Nessuna partita nei prossimi giorni.</h3></div>
      : <>
        {family.length > 0 && <><h3 className="day-title">💛❤️ / 🤍🖤 Le partite di casa</h3><div className="lu-grid">{family.map(card)}</div></>}
        {days.map(d => <div key={d}><h3 className="day-title">{d}</h3><div className="lu-grid">{list.filter(f => dayOf(f.kickoff) === d && !family.includes(f)).map(card)}</div></div>)}
      </>}
  </div>;
}

// Small crests of the two family teams next to the QUORUM logo.
export function FamilyCrests() {
  const [c, setC] = useState<{ roma?: string | null; juve?: string | null }>({});
  useEffect(() => { let s: any = {}; try { s = JSON.parse(localStorage.getItem('quorum-crests') || '{}'); } catch {} if (s.roma && s.juve) { setC(s); return; } get('crests').then(x => { setC(x); try { localStorage.setItem('quorum-crests', JSON.stringify(x)); } catch {} }, () => null); }, []);
  if (!c.roma && !c.juve) return null;
  return <span className="family-crests">{c.roma && <img src={c.roma} alt="Roma" />}{c.juve && <img src={c.juve} alt="Juventus" />}</span>;
}

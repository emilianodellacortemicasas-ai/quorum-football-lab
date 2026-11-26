'use client';
import { useState } from 'react';
import { RefreshCw } from 'lucide-react';

// "Quote adesso": reads the Italian bookmakers for one match right now (1 request, every bookmaker).
// The fresh prices also re-grade the Centro Tipster proposals on that match.
export type Fresh = { at: string; reused: boolean; quotes: Record<string, Record<string, number>>; left: number; month: { used: number; limit: number } };
export function useLiveQuotes(notify: (m: string) => void) {
  const [busy, setBusy] = useState(''), [fresh, setFresh] = useState<Record<string, Fresh>>({});
  async function refresh(fixtureId: string) {
    setBusy(fixtureId);
    try {
      const r = await fetch('/api/scanner', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'it-refresh', fixtureId }) });
      const x: any = await r.json(); if (!r.ok) throw new Error(x.error);
      setFresh(f => ({ ...f, [fixtureId]: x }));
      notify((x.reused ? 'Quote lette da meno di 15 minuti, nessun aggiornamento consumato.' : 'Quote italiane aggiornate adesso.') + ' Ti restano ' + x.left + ' aggiornamenti oggi.');
      return x as Fresh;
    } catch (e: any) { notify(e.message || 'Aggiornamento non riuscito.'); return null; } finally { setBusy(''); }
  }
  return { busy, fresh, refresh };
}
const hm = (s: string) => new Date(s).toLocaleTimeString('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' });
export function LiveButton({ fixtureId, busy, onClick, at }: { fixtureId: string; busy: string; onClick: () => void; at?: string }) {
  return <button type="button" className="live-btn" disabled={!!busy} onClick={onClick} title="Legge adesso le quote di Lottomatica, Planet, Snai, Sisal ed Eurobet per questa partita">
    <RefreshCw size={14} className={busy === fixtureId ? 'spin' : ''} />{busy === fixtureId ? 'Leggo le quote…' : at ? 'Quote delle ' + hm(at) + ' · aggiorna' : 'Quote adesso'}</button>;
}
export function FreshRow({ q, p }: { q?: Record<string, number>; p: number }) {
  if (!q) return <p className="small-note">I bookmaker italiani non quotano adesso questo esito.</p>;
  const best = Math.max(...Object.values(q));
  return <div className="value-it ok fresh">{Object.entries(q).sort((a, b) => b[1] - a[1]).map(([b, v]) => <span key={b}>{b === 'Lottomatica' ? 'Lottomatica / Planet' : b} <b>{v.toFixed(2)}</b></span>)}<em>{best * p > 1 ? 'con valore adesso' : 'senza valore adesso'}</em></div>;
}

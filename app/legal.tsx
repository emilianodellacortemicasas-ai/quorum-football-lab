'use client';
import { useEffect, useState } from 'react';

export type Biz = { name: string; vat: string; address: string; email: string; pec: string; court?: string } | null;
export function useBilling() {
  const [d, setD] = useState<any>(null);
  useEffect(() => { fetch('/api/billing', { cache: 'no-store' }).then(r => r.json()).then(setD, () => setD({ error: true })); }, []);
  return d;
}
// Business data appear only once filled in /lancio; until then a clear placeholder.
export const bizName = (b: Biz) => b?.name || '[Ragione sociale da completare]';
export const bizLine = (b: Biz) => b ? `${b.name} · P.IVA ${b.vat} · ${b.address} · ${b.email} · PEC ${b.pec}` : '[Dati dell’impresa da completare in /lancio]';

export function LegalShell({ title, updated, children, draft = true }: { title: string; updated: string; children: React.ReactNode; draft?: boolean }) {
  return <main className="legal-page">
    <a href="/" className="connections-brand">QUORUM<span>FOOTBALL LAB</span></a>
    <nav className="legal-nav"><a href="/prezzi">Piani</a><a href="/termini">Termini</a><a href="/privacy">Privacy e cookie</a><a href="/gioco-responsabile">Gioco responsabile</a></nav>
    <h1>{title}</h1>
    <p className="legal-updated">Ultimo aggiornamento: {updated}</p>
    {draft && <p className="legal-draft">Bozza in attesa di revisione legale: non è ancora in vigore.</p>}
    {children}
    <Footer />
  </main>;
}
export function Footer() {
  const d = useBilling();
  return <footer className="legal-footer">
    <p><b>18+</b> Servizio riservato ai maggiorenni. QUORUM è un software di analisi statistica: non accetta scommesse, non è un bookmaker e non ha rapporti commerciali con operatori di gioco. Il gioco può causare dipendenza.</p>
    <p>{bizLine(d?.business ?? null)}</p>
  </footer>;
}

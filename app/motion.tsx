'use client';
// Motion layer: animated pitch banner, count-up numbers, reliability ring, 3D tilt on cards.
import { useEffect, useRef, useState } from 'react';

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Number that counts up to its value when it appears or changes.
export function Count({ value, format, duration = 900 }: { value: number; format: (v: number) => string; duration?: number }) {
  const [v, setV] = useState(value), from = useRef(0);
  useEffect(() => {
    if (reduced()) { setV(value); return; }
    const start = performance.now(), a = from.current, b = value; let raf = 0;
    const tick = (t: number) => { const k = Math.min(1, (t - start) / duration), e = 1 - Math.pow(1 - k, 3); setV(a + (b - a) * e); if (k < 1) raf = requestAnimationFrame(tick); else from.current = b; };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{format(v)}</>;
}

// Circular gauge that fills up to p (0–1).
export function Ring({ p, size = 64 }: { p: number; size?: number }) {
  const r = size / 2 - 6, c = 2 * Math.PI * r, color = p >= 0.6 ? '#14895a' : p >= 0.35 ? '#d49a12' : '#c2512e';
  return <svg className="q-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
    <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(6,40,27,.1)" strokeWidth="7" />
    <circle className="q-ring-fill" cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
      strokeDasharray={c} style={{ ['--q-c' as any]: c, ['--q-off' as any]: c * (1 - Math.max(0.02, Math.min(1, p))) }} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
  </svg>;
}

// Animated pitch: passing lines that draw themselves, a ball that travels between players, pulsing players.
export function PitchBanner({ title, text, stats }: { title: string; text: string; stats?: [string, string][] }) {
  return <section className="q-banner">
    <svg className="q-pitch" viewBox="0 0 600 220" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="qg" x1="0" x2="1"><stop offset="0" stopColor="#b6f23e" stopOpacity="0" /><stop offset=".5" stopColor="#b6f23e" /><stop offset="1" stopColor="#ffc83d" stopOpacity="0" /></linearGradient>
        <radialGradient id="qball"><stop offset="0" stopColor="#fff" /><stop offset="1" stopColor="#d9f7b0" /></radialGradient>
      </defs>
      <g className="q-lines" stroke="rgba(182,242,62,.22)" fill="none" strokeWidth="1.4">
        <rect x="10" y="10" width="580" height="200" rx="6" /><line x1="300" y1="10" x2="300" y2="210" /><circle cx="300" cy="110" r="38" />
        <rect x="10" y="60" width="70" height="100" /><rect x="520" y="60" width="70" height="100" />
      </g>
      <path id="qpath" className="q-pass" d="M80 150 C 160 60, 220 60, 300 110 S 450 170, 520 70" fill="none" stroke="url(#qg)" strokeWidth="3" strokeLinecap="round" />
      <path className="q-pass q-pass-2" d="M120 60 C 200 150, 300 170, 400 90" fill="none" stroke="url(#qg)" strokeWidth="2" strokeLinecap="round" />
      {[[80, 150], [190, 75], [300, 110], [420, 150], [520, 70], [120, 60], [400, 90]].map(([x, y], i) => <g key={i} className="q-player" style={{ animationDelay: i * 0.35 + 's' }}><circle cx={x} cy={y} r="11" fill="rgba(182,242,62,.12)" /><circle cx={x} cy={y} r="4.5" fill="#b6f23e" /></g>)}
      <circle r="6" fill="url(#qball)" className="q-ball"><animateMotion dur="5s" repeatCount="indefinite" rotate="auto"><mpath href="#qpath" /></animateMotion></circle>
    </svg>
    <div className="q-banner-copy"><h2>{title}</h2><p>{text}</p>
      {stats && <div className="q-stats">{stats.map(([k, v]) => <span key={k}><b>{v}</b>{k}</span>)}</div>}</div>
  </section>;
}

// 3D tilt with a light glare that follows the pointer (desktop only).
export function useTilt() {
  useEffect(() => {
    if (reduced() || !window.matchMedia?.('(pointer: fine)').matches) return;
    let el: HTMLElement | null = null;
    const move = (e: PointerEvent) => {
      const card = (e.target as HTMLElement)?.closest?.('.value-card, .builder-match, .metric') as HTMLElement | null;
      if (el && el !== card) { el.style.removeProperty('--rx'); el.style.removeProperty('--ry'); el.classList.remove('q-tilt'); }
      el = card; if (!card) return;
      const r = card.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      card.classList.add('q-tilt');
      // Safe tilt: the rotation is capped so that no point of the card moves more than ~3 px under the cursor,
      // whatever its size: buttons never slip away from the click.
      const maxX = Math.min(6, Math.atan(3 / (r.height / 2)) * 180 / Math.PI), maxY = Math.min(8, Math.atan(3 / (r.width / 2)) * 180 / Math.PI);
      card.style.setProperty('--rx', ((0.5 - y) * 2 * maxX).toFixed(3) + 'deg'); card.style.setProperty('--ry', ((x - 0.5) * 2 * maxY).toFixed(3) + 'deg');
      card.style.setProperty('--gx', (x * 100).toFixed(1) + '%'); card.style.setProperty('--gy', (y * 100).toFixed(1) + '%');
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => window.removeEventListener('pointermove', move);
  }, []);
}

// Scrolling ticker with the most probable outcomes of the week (Italian prices).
export function Ticker() {
  const [items, setItems] = useState<{ t: string; p: number; o: number }[]>([]);
  useEffect(() => {
    fetch('/api/scanner?view=predictions', { cache: 'no-store' }).then(r => r.json()).then((d: any) => {
      const names: Record<string, string> = { home: '1', draw: 'X', away: '2', homeDraw: '1X', drawAway: 'X2', homeAway: '12', over15: 'Over 1,5', under15: 'Under 1,5', over25: 'Over 2,5', under25: 'Under 2,5', over35: 'Over 3,5', under35: 'Under 3,5', btts: 'Goal', noGoal: 'No Goal' };
      const out: { t: string; p: number; o: number }[] = [];
      for (const m of d.matches || []) {
        let best: { t: string; p: number; o: number } | null = null;
        for (const k of Object.keys(names)) { const x = m.markets?.[k]; const it = x?.it ? Math.max(...Object.values<number>(x.it)) : 0; if (x && it >= 1.15 && (!best || x.pBlend > best.p)) best = { t: m.fixture + ' · ' + names[k], p: x.pBlend, o: it }; }
        if (best) out.push(best);
      }
      setItems(out.sort((a, b) => b.p - a.p).slice(0, 14));
    }).catch(() => undefined);
  }, []);
  if (!items.length) return null;
  const row = items.map((x, i) => <span key={i}><b>{Math.round(x.p * 100)}%</b>{x.t}<i>{x.o.toFixed(2)}</i></span>);
  return <div className="q-ticker" aria-label="Esiti più probabili della settimana"><span className="q-ticker-label">PIÙ PROBABILI</span><div className="q-ticker-track"><div className="q-ticker-run">{row}{row}</div></div></div>;
}

// Ripple on tap / click for buttons.
export function useRipple() {
  useEffect(() => {
    if (reduced()) return;
    const down = (e: PointerEvent) => {
      const b = (e.target as HTMLElement)?.closest?.('button, .pick-chip') as HTMLElement | null; if (!b) return;
      const r = b.getBoundingClientRect(), s = document.createElement('span'), d = Math.max(r.width, r.height) * 2;
      s.className = 'q-ripple'; s.style.width = s.style.height = d + 'px'; s.style.left = e.clientX - r.left - d / 2 + 'px'; s.style.top = e.clientY - r.top - d / 2 + 'px';
      if (getComputedStyle(b).position === 'static') b.style.position = 'relative';
      b.style.overflow = 'hidden'; b.appendChild(s); setTimeout(() => s.remove(), 650);
    };
    window.addEventListener('pointerdown', down, { passive: true });
    return () => window.removeEventListener('pointerdown', down);
  }, []);
}

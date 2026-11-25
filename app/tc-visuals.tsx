'use client';
// Visual pieces of the Centro Tipster "control room": matrix rain of odds, 3D pulsing core, tilting holo panels,
// half-ring gauge, units curve, countdown to the next scan and the market ticker. All respect prefers-reduced-motion.
import { useEffect, useRef, useState, type ReactNode } from 'react';

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Rain of odds, percentages and market codes, like entering the tipster's mind.
export function MatrixRain({ density = 1 }: { density?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return; const ctx = c.getContext('2d'); if (!ctx) return;
    const TOK = ['1.95', '2.10', '+4.2%', 'CLV', 'EV+', '1X', 'X2', 'U2.5', 'O2.5', 'GG', '0.53', 'PIN', '3.40', '+2.6%', 'Δ8.6', 'KELLY', '¼', 'u', '1.87', '0', '1', '7', '9', '%', '→'];
    let w = 0, h = 0, cols: { y: number; v: number; t: string[] }[] = [], raf = 0, last = 0, run = true;
    const fs = 13, gap = 22;
    const size = () => { const r = c.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1); w = r.width; h = r.height; c.width = w * d; c.height = h * d; ctx.setTransform(d, 0, 0, d, 0, 0);
      cols = Array.from({ length: Math.ceil(w / gap * density) }, () => ({ y: Math.random() * -h, v: 0.6 + Math.random() * 1.6, t: [] })); ctx.fillStyle = '#05100b'; ctx.fillRect(0, 0, w, h); };
    size();
    const draw = (ts: number) => {
      if (!run) return; raf = requestAnimationFrame(draw);
      if (ts - last < 45) return; last = ts;
      ctx.fillStyle = 'rgba(5,16,11,0.16)'; ctx.fillRect(0, 0, w, h);
      ctx.font = '600 ' + fs + 'px ui-monospace, SFMono-Regular, Menlo, monospace';
      cols.forEach((col, i) => {
        const x = (i / density) * gap + 4, tok = TOK[(Math.random() * TOK.length) | 0];
        ctx.fillStyle = Math.random() < 0.06 ? '#f2ffd0' : Math.random() < 0.12 ? '#ff9f43' : 'rgba(182,242,62,0.85)';
        ctx.fillText(tok, x, col.y);
        col.y += fs * col.v; if (col.y > h + 40 && Math.random() > 0.96) col.y = -20 - Math.random() * 200;
      });
    };
    if (reduced()) { draw(0); run = false; } else raf = requestAnimationFrame(draw);
    const ro = new ResizeObserver(size); ro.observe(c);
    const vis = () => { if (document.hidden) { run = false; cancelAnimationFrame(raf); } else if (!reduced()) { run = true; raf = requestAnimationFrame(draw); } };
    document.addEventListener('visibilitychange', vis);
    return () => { run = false; cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener('visibilitychange', vis); };
  }, [density]);
  return <canvas ref={ref} className="tcx-rain" aria-hidden="true" />;
}

// Panel that tilts in 3D following the pointer, with a moving light reflection.
export function Tilt({ children, className = '', max = 10 }: { children: ReactNode; className?: string; max?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (e: React.PointerEvent) => { const el = ref.current; if (!el || reduced() || e.pointerType === 'touch') return; const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(900px) rotateX(${(-y * max).toFixed(2)}deg) rotateY(${(x * max).toFixed(2)}deg) translateZ(0)`; el.style.setProperty('--gx', (x + 0.5) * 100 + '%'); el.style.setProperty('--gy', (y + 0.5) * 100 + '%'); };
  const leave = () => { const el = ref.current; if (el) el.style.transform = ''; };
  return <div ref={ref} className={'tcx-tilt ' + className} onPointerMove={move} onPointerLeave={leave}>{children}</div>;
}

// The heart of the platform: 3D rings around a pulsing core; dots orbit = live opportunities.
export function Core({ value, label, sub, tone = 'lime', orbit = 0 }: { value: string; label: string; sub?: string; tone?: 'lime' | 'amber' | 'red'; orbit?: number }) {
  return <div className={'tcx-core t-' + tone} aria-label={label + ' ' + value}>
    <div className="tcx-stage">
      <i className="ring r1" /><i className="ring r2" /><i className="ring r3" /><i className="ring r4" />
      <div className="tcx-orbit">{Array.from({ length: Math.min(8, orbit) }, (_, k) => <b key={k} style={{ transform: `rotate(${k * 360 / Math.max(1, Math.min(8, orbit))}deg) translateX(var(--orb, 118px))` }} />)}</div>
      <div className="tcx-heart"><span>{label}</span><strong>{value}</strong>{sub && <small>{sub}</small>}</div>
    </div>
  </div>;
}

// Half-ring gauge (0–1) with a value in the middle.
export function Gauge({ v, label, value, sub }: { v: number; label: string; value: string; sub?: string }) {
  const x = Math.max(0, Math.min(1, v)), R = 80, L = Math.PI * R;
  return <div className="tcx-gauge"><svg viewBox="0 0 200 116">
    <defs><linearGradient id="tcxg" x1="0" x2="1"><stop offset="0" stopColor="#ff5a4e" /><stop offset=".5" stopColor="#ffb020" /><stop offset="1" stopColor="#b6f23e" /></linearGradient></defs>
    <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="16" strokeLinecap="round" />
    <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="url(#tcxg)" strokeWidth="16" strokeLinecap="round" strokeDasharray={L} strokeDashoffset={L * (1 - x)} className="tcx-arc" />
    {Array.from({ length: 11 }, (_, i) => { const a = Math.PI * (1 - i / 10); return <line key={i} x1={100 + 62 * Math.cos(a)} y1={100 - 62 * Math.sin(a)} x2={100 + 56 * Math.cos(a)} y2={100 - 56 * Math.sin(a)} stroke="rgba(255,255,255,.25)" strokeWidth="1.5" />; })}
  </svg><div><span>{label}</span><strong>{value}</strong>{sub && <small>{sub}</small>}</div></div>;
}

// Cumulative units curve with glow.
export function Curve({ points }: { points: { at: string; u: number }[] }) {
  if (points.length < 2) return <div className="tcx-curve tcx-nodata"><small>La curva delle unità parte dalle prime giocate chiuse.</small></div>;
  const ys = [0, ...points.map(p => p.u)], min = Math.min(...ys), max = Math.max(...ys), span = max - min || 1, W = 300, H = 90;
  const pt = (u: number, i: number) => [(i / points.length) * W, H - ((u - min) / span) * (H - 10) - 5];
  const path = [[0, pt(0, 0)[1]], ...points.map((p, i) => pt(p.u, i + 1))].map(([x, y], i) => (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1)).join(' ');
  const zero = H - ((0 - min) / span) * (H - 10) - 5, up = points[points.length - 1].u >= 0;
  return <div className="tcx-curve"><svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
    <defs><linearGradient id="tcxc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={up ? '#b6f23e' : '#ff5a4e'} stopOpacity=".45" /><stop offset="1" stopColor={up ? '#b6f23e' : '#ff5a4e'} stopOpacity="0" /></linearGradient></defs>
    <line x1="0" x2={W} y1={zero} y2={zero} stroke="rgba(255,255,255,.18)" strokeDasharray="4 4" />
    <path d={path + ` L${W} ${H} L0 ${H} Z`} fill="url(#tcxc)" />
    <path d={path} fill="none" stroke={up ? '#b6f23e' : '#ff5a4e'} strokeWidth="2.5" className="tcx-line" />
  </svg></div>;
}

// Countdown to the next automatic scan (crons at :40 of 02, 05, 08, 11, 14, 17, 20, 23 UTC).
export function nextScan(now = Date.now()) {
  const d = new Date(now);
  for (let k = 0; k < 30; k++) { const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 40) + k * 3600000); if (t.getUTCHours() % 3 === 2 && t.getTime() > now) return t.getTime(); }
  return now + 3 * 3600000;
}
export function Countdown() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);
  const left = Math.max(0, nextScan(now) - now), h = Math.floor(left / 3600000), m = Math.floor(left / 60000) % 60, s = Math.floor(left / 1000) % 60, pct = 1 - left / (3 * 3600000);
  return <div className="tcx-count"><span>Prossimo controllo</span><strong>{String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}</strong><i><b style={{ width: Math.max(2, pct * 100) + '%' }} /></i></div>;
}

// Market ticker: steam and drift scrolling like a trading floor.
export function Ticker({ items }: { items: { k: string; text: string; tone: 'up' | 'down' }[] }) {
  if (!items.length) return null;
  const row = items.map(x => <span key={x.k} className={'tcx-tk ' + x.tone}>{x.tone === 'up' ? '▲' : '▼'} {x.text}</span>);
  return <div className="tcx-ticker" aria-label="Movimenti del mercato"><div className="tcx-track">{row}{row}</div></div>;
}

// Number that counts up when it appears.
export function CountUp({ to, format }: { to: number; format: (v: number) => string }) {
  const [v, setV] = useState(reduced() ? to : 0);
  useEffect(() => { if (reduced()) { setV(to); return; } let raf = 0; const t0 = performance.now(); const tick = (t: number) => { const k = Math.min(1, (t - t0) / 900); setV(to * (1 - Math.pow(1 - k, 3))); if (k < 1) raf = requestAnimationFrame(tick); }; raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf); }, [to]);
  return <>{format(v)}</>;
}

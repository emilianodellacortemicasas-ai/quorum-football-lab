'use client';
import { useEffect, useState } from 'react';
import { CalendarDays } from 'lucide-react';

// Day filter shared by Schedine pronte and Tipster: "Oggi" by default, so that prices that can still move
// in the next days stay out of sight. The choice is remembered.
export const todayRome = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date());
export function useDay(key: string) {
  const [day, setDay] = useState<string>('');
  const [ready, setReady] = useState(false);
  useEffect(() => { let v = todayRome(); try { const s = localStorage.getItem('quorum-day-' + key); if (s !== null) v = s === 'all' ? '' : s; } catch {} if (v && v < todayRome()) v = todayRome(); setDay(v); setReady(true); }, [key]);
  const set = (d: string) => { setDay(d); try { localStorage.setItem('quorum-day-' + key, d || 'all'); } catch {} };
  return { day, setDay: set, ready };
}
const label = (d: string) => {
  const t = todayRome(), tm = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date(Date.now() + 86400000));
  const date = new Date(d + 'T12:00:00Z').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Rome' });
  return d === t ? 'Oggi · ' + date : d === tm ? 'Domani · ' + date : date;
};
export function DayFilter({ days, day, onChange }: { days?: { day: string; n: number }[]; day: string; onChange: (d: string) => void }) {
  const list = (days || []).filter(x => x.day >= todayRome());
  return <div className="day-filter"><span><CalendarDays size={15} />Partite di</span>
    {list.map(x => <button key={x.day} className={day === x.day ? 'on' : ''} onClick={() => onChange(x.day)}>{label(x.day)}<b title="partite">{x.n} {x.n === 1 ? 'partita' : 'partite'}</b></button>)}
    <button className={day === '' ? 'on' : ''} onClick={() => onChange('')}>Tutti i giorni</button>
  </div>;
}

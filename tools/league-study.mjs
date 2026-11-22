// Studio dei campionati: in quali leghe un bookmaker "morbido" (Bet365, simile ai bookmaker italiani) paga più
// della quota giusta di Pinnacle (senza margine)? Regola dei tipster: gioca solo quando quota > probabilità reale.
const LEAGUES = { E0: 'Premier League', E1: 'Championship', E2: 'League One', SC0: 'Scozia Premiership', D1: 'Bundesliga', D2: '2. Bundesliga', I1: 'Serie A', I2: 'Serie B', SP1: 'La Liga', SP2: 'Segunda', F1: 'Ligue 1', F2: 'Ligue 2', N1: 'Eredivisie', B1: 'Belgio Pro League', P1: 'Portogallo', T1: 'Turchia', G1: 'Grecia' };
const SEASONS = ['2223', '2324', '2425', '2526'];
const num = v => { const x = Number(v); return Number.isFinite(x) && x > 1 ? x : null; };
function parse(csv) { const [h, ...rows] = csv.replace(/\r/g, '').split('\n').filter(Boolean); const k = h.split(','); return rows.map(r => { const v = r.split(','), o = {}; k.forEach((c, i) => o[c] = v[i]); return o; }); }
const out = [];
for (const [code, name] of Object.entries(LEAGUES)) {
  const st = { name, matches: 0, margin: 0, bets: {}, clv: 0, clvN: 0 };
  const add = (key, win, odds) => { const s = st.bets[key] ??= { n: 0, profit: 0 }; s.n++; s.profit += win ? odds - 1 : -1; };
  for (const s of SEASONS) {
    let csv; try { const r = await fetch(`https://www.football-data.co.uk/mmz4281/${s}/${code}.csv`); if (!r.ok) continue; csv = await r.text(); } catch { continue; }
    for (const m of parse(csv)) {
      const res = m.FTR, P = [num(m.PSH), num(m.PSD), num(m.PSA)], B = [num(m.B365H), num(m.B365D), num(m.B365A)], X = [num(m.MaxH), num(m.MaxD), num(m.MaxA)], C = [num(m.PSCH), num(m.PSCD), num(m.PSCA)];
      if (!res || P.some(x => !x) || B.some(x => !x)) continue;
      st.matches++; st.margin += B.reduce((a, x) => a + 1 / x, 0) - 1;
      const inv = P.reduce((a, x) => a + 1 / x, 0), fair = P.map(x => 1 / x / inv);
      const cinv = C.every(Boolean) ? C.reduce((a, x) => a + 1 / x, 0) : null, cfair = cinv ? C.map(x => 1 / x / cinv) : null;
      ['H', 'D', 'A'].forEach((o, i) => {
        const win = res === o, eb = fair[i] * B[i] - 1;
        if (B[i] <= 4) for (const t of [0.02, 0.04]) if (eb >= t) { add('b365_' + t, win, B[i]); if (cfair) { st.clv += cfair[i] * B[i] - 1; st.clvN++; } }
        if (X[i] && X[i] <= 4 && fair[i] * X[i] - 1 >= 0.03) add('max_0.03', win, X[i]);
      });
      // Over/Under 2,5
      const po = num(m['P>2.5']), pu = num(m['P<2.5']), bo = num(m['B365>2.5']), bu = num(m['B365<2.5']);
      if (po && pu && bo && bu) { const iv = 1 / po + 1 / pu, fo = 1 / po / iv, tot = Number(m.FTHG) + Number(m.FTAG);
        if (fo * bo - 1 >= 0.03) add('ou_0.03', tot >= 3, bo); if ((1 - fo) * bu - 1 >= 0.03) add('ou_0.03', tot < 3, bu); }
    }
  }
  if (!st.matches) { console.log('NO DATA', code); continue; }
  const f = k => st.bets[k] ? `${st.bets[k].n} giocate ROI ${(st.bets[k].profit / st.bets[k].n * 100).toFixed(1)}%` : '-';
  out.push({ code, name, matches: st.matches, margin: st.margin / st.matches, b2: st.bets['b365_0.02'], b4: st.bets['b365_0.04'], mx: st.bets['max_0.03'], ou: st.bets['ou_0.03'], clv: st.clvN ? st.clv / st.clvN : null });
  console.log(`${code.padEnd(4)} ${name.padEnd(20)} partite ${st.matches} | margine B365 ${(st.margin / st.matches * 100).toFixed(1)}% | B365≥+2%: ${f('b365_0.02')} | B365≥+4%: ${f('b365_0.04')} | Max≥+3%: ${f('max_0.03')} | O/U≥+3%: ${f('ou_0.03')} | CLV ${st.clvN ? (st.clv / st.clvN * 100).toFixed(1) + '%' : '-'}`);
}
console.log('JSON ' + JSON.stringify(out));

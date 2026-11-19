import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildTickets} from '../lib/tickets.ts';
const mk=(i,ps)=>({fixture_id:'sm-'+i,fixture:'A'+i+' – B'+i,competition:'Serie A',kickoff:new Date(Date.now()+86400000+i*3600000).toISOString(),markets:Object.fromEntries(Object.entries(ps).map(([k,[p,o]])=>[k,{pBlend:p,bestOdds:o,bookmaker:'X',books:8}]))});
const matches=Array.from({length:12},(_,i)=>mk(i,{home:[0.55+i*0.02,1.75],draw:[0.25,3.6],away:[0.2,4.5],over15:[0.78,1.28],under25:[0.48,2.12],over25:[0.52,1.9]}));
test('tickets: one leg per match, odds windows respected',()=>{
  const {singles,tickets}=buildTickets(matches);
  assert.ok(singles.length>0);for(const s of singles)assert.ok(s.odds>=1.8&&s.odds<=2.4);
  const r=tickets.find(t=>t.kind==='raddoppio-multipla');assert.ok(r);assert.ok(r.odds>=1.9&&r.odds<=2.3);
  for(const t of tickets)assert.equal(new Set(t.legs.map(l=>l.fixtureId)).size,t.legs.length);
  for(const t of tickets.filter(t=>t.kind.startsWith('quota10-')))assert.ok(t.odds>=9.5&&t.odds<=13.5);
});
test('bomba: high odds, 5–8 legs, distinct matches',()=>{
  const ms=Array.from({length:16},(_,i)=>mk(i,{home:[0.5+(i%5)*0.02,2.1],over25:[0.55,1.85],under25:[0.45,2.05]}));
  const {bomb}=buildTickets(ms);assert.ok(bomb);assert.ok(bomb.odds>=50&&bomb.odds<=200);
  assert.ok(bomb.legs.length>=5&&bomb.legs.length<=8);assert.equal(new Set(bomb.legs.map(l=>l.fixtureId)).size,bomb.legs.length);
});
test('multipla più probabile: top-k probabilities on distinct matches',()=>{
  const {probable}=buildTickets(matches);assert.equal(probable.length,3);
  const p4=probable.find(t=>t.kind==='probabile-4');assert.equal(p4.legs.length,4);
  assert.equal(new Set(p4.legs.map(l=>l.fixtureId)).size,4);
  assert.ok(probable[0].p>=probable[1].p&&probable[1].p>=probable[2].p);
});
test('multiple a quota 10: 3 e 5 eventi',()=>{
  const ms=Array.from({length:14},(_,i)=>mk(i,{home:[0.47+(i%4)*0.02,2.15],over25:[0.56,1.8],under25:[0.44,2.2],btts:[0.6,1.62]}));
  const {tickets}=buildTickets(ms);
  for(const k of [3,5]){const t=tickets.find(x=>x.kind==='quota10-'+k);assert.ok(t,'manca '+k);assert.equal(t.legs.length,k);assert.ok(t.odds>=9.5&&t.odds<=13.5);assert.equal(new Set(t.legs.map(l=>l.fixtureId)).size,k);}
});
test('varietà: al massimo metà Over/Under quando esistono alternative, quote italiane preferite',()=>{
  const ms=Array.from({length:10},(_,i)=>mk(i,{home:[0.66+(i%3)*0.02,1.45],over15:[0.82,1.22],under35:[0.75,1.3]}));
  ms[0].markets.home.it={Lottomatica:1.5,Planetwin365:1.5};
  const {probable}=buildTickets(ms);
  for(const t of probable){const lines=t.legs.filter(l=>/^(over|under)/.test(l.market)).length;assert.ok(lines<=Math.ceil(t.legs.length/2),t.kind);assert.ok(t.low<=t.p&&t.p<=t.high);}
  const all=probable.flatMap(t=>t.legs),it=all.find(l=>l.fixtureId==='sm-0'&&l.market==='home');
  if(it){assert.equal(it.odds,1.5);assert.equal(it.bookmaker,'Lottomatica / Planetwin365');assert.ok(it.italian);}
});

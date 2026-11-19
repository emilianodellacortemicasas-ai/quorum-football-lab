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
  const a=tickets.find(t=>t.kind==='ambiziosa');if(a)assert.ok(a.odds>=10&&a.odds<=25);
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

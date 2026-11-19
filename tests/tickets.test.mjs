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

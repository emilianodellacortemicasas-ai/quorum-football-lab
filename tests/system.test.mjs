import {test} from 'node:test';
import assert from 'node:assert/strict';
import {evaluateClasses} from '../lib/math.ts';
const sel=[['a',1.90],['b',1.97],['c',2.60]].map(([id,o])=>({fixtureId:id,fixture:id,market:'x',label:'x',p:0.5,odds:o}));
test('sistema come Planetwin365: singole + doppie + tripla',()=>{
  const r=evaluateClasses(sel,[{k:1,unitCents:160},{k:2,unitCents:85},{k:3,unitCents:90}]);
  assert.equal(r.tickets,7);assert.equal(r.costCents,825);assert.equal(r.minWinCents,304);
  assert.ok(Math.abs(r.maxReturnCents-3082)<=3,String(r.maxReturnCents));
  assert.equal(r.breakEven,2);assert.equal(r.byWinners[1].minReturnCents,304);assert.equal(r.byWinners[0].maxReturnCents,0);
});

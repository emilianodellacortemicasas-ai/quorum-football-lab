import {test} from 'node:test';
import assert from 'node:assert/strict';
import {outcome,ticketOutcome} from '../lib/settle-contract.ts';
const f={hg:2,ag:1,corners:[6,4],yellow:[2,3],red:[0,1],penAwarded:[1,0],penMissed:[1,0],scorers:[10,11]};
test('markets settle correctly',()=>{
  assert.equal(outcome('home',f),'won');assert.equal(outcome('draw',f),'lost');assert.equal(outcome('over25',f),'won');assert.equal(outcome('under35',f),'won');
  assert.equal(outcome('btts',f),'won');assert.equal(outcome('exact:2-1',f),'won');assert.equal(outcome('homeDraw',f),'won');
  assert.equal(outcome('corners:total:over:9.5',f),'won');assert.equal(outcome('corners:total:over:10',f),'void');
  assert.equal(outcome('cards:total:under:5.5',f),'lost');assert.equal(outcome('yellow:away:over:2.5',f),'won');
  assert.equal(outcome('pen:awarded:yes',f),'won');assert.equal(outcome('pen:missed:yes',f),'won');
  assert.equal(outcome('scorer:10',f),'won');assert.equal(outcome('scorer:99',f),'lost');
  assert.equal(outcome('corners:total:over:9.5',{...f,corners:null}),null);
});
test('tickets',()=>{assert.equal(ticketOutcome(['won','void','won']),'won');assert.equal(ticketOutcome(['won',null]),null);assert.equal(ticketOutcome(['won',null,'lost']),'lost');});

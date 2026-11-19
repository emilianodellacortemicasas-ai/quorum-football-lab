import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sameTeam,matchEvent,marketConsensus,evaluateOutcome} from '../lib/scanner-contract.ts';
import {sportmonksCompetition} from '../lib/sportmonks-contract.ts';

test('team names reconcile across providers',()=>{
  assert.ok(sameTeam('FC Bayern München','Bayern Munich'));
  assert.ok(sameTeam('Inter','Inter Milan'));
  assert.ok(sameTeam('Wolverhampton Wanderers','Wolves'));
  assert.ok(sameTeam('Paris Saint-Germain','Paris Saint Germain'));
  assert.ok(sameTeam('Atlético Madrid','Atletico Madrid'));
  assert.ok(!sameTeam('Atlético Madrid','Athletic Bilbao'));
  assert.ok(!sameTeam('Napoli','Juventus'));
});
test('fixture is paired only with the right event',()=>{
  const k='2026-11-21T14:00:00Z';
  const events=[{id:'a',home_team:'Manchester City',away_team:'Brighton and Hove Albion',commence_time:k},{id:'b',home_team:'Brentford',away_team:'Manchester United',commence_time:k}];
  assert.equal(matchEvent({id:'1',home:'Brentford',away:'Manchester United',kickoff:k,competition:'Premier League'},events)?.id,'b');
  assert.equal(matchEvent({id:'2',home:'Arsenal',away:'Chelsea',kickoff:k,competition:'Premier League'},events),null);
  assert.equal(matchEvent({id:'3',home:'Brentford',away:'Manchester United',kickoff:'2026-11-22T14:00:00Z',competition:'Premier League'},events),null);
});
test('consensus removes margin per book and keeps best price',()=>{
  const ev={id:'x',home_team:'A',away_team:'B',commence_time:'2026-11-21T14:00:00Z',bookmakers:[
    {title:'Book1',markets:[{key:'h2h',outcomes:[{name:'A',price:2.0},{name:'Draw',price:3.4},{name:'B',price:3.8}]},{key:'totals',outcomes:[{name:'Over',point:2.5,price:1.9},{name:'Under',point:2.5,price:1.9}]}]},
    {title:'Book2',markets:[{key:'h2h',outcomes:[{name:'A',price:2.1},{name:'Draw',price:3.3},{name:'B',price:3.6}]}]}]};
  const c=marketConsensus(ev);
  assert.equal(c.home.bestOdds,2.1);assert.equal(c.home.bookmaker,'Book2');assert.equal(c.home.books,2);
  const total=c.home.pMarket+c.draw.pMarket+c.away.pMarket;assert.ok(Math.abs(total-1)<1e-9);
  assert.ok(Math.abs(c.over25.pMarket-0.5)<1e-9);
});
test('value requires edge, books and agreement with market',()=>{
  assert.equal(evaluateOutcome(0.55,{pMarket:0.50,bestOdds:2.15,books:6}).isPick,true);
  assert.equal(evaluateOutcome(0.50,{pMarket:0.50,bestOdds:1.95,books:6}).isPick,false);
  assert.equal(evaluateOutcome(0.80,{pMarket:0.50,bestOdds:2.2,books:6}).isPick,false);
  assert.equal(evaluateOutcome(0.55,{pMarket:0.50,bestOdds:2.15,books:2}).isPick,false);
  assert.ok(evaluateOutcome(0.55,{pMarket:0.50,bestOdds:2.15,books:6}).kelly<=0.02);
});
test('perimeter: Bundesliga and Coppa Italia in, Serie B out',()=>{
  assert.equal(sportmonksCompetition({name:'Bundesliga',country:{name:'Germany'}})?.id,78);
  assert.equal(sportmonksCompetition({name:'Coppa Italia',country:{name:'Italy'}})?.id,137);
  assert.equal(sportmonksCompetition({name:'Serie B',country:{name:'Italy'}}),null);
});

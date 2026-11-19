import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classifyOpenAiError} from '../lib/openai-errors.ts';
import {historicalGoalMeans,sportmonksFixture,sportmonksCompetition} from '../lib/sportmonks-contract.ts';
import {cleanOddsQuotes} from '../lib/odds-contract.ts';
test('OpenAI permission failures require evidence; generic 403 and missing scopes differ',()=>{
 assert.equal(classifyOpenAiError(403,{},'models').category,'access_denied');
 assert.equal(classifyOpenAiError(401,{error:{message:'Missing scopes: api.model.read'}},'models').category,'model_list_permission');
 assert.equal(classifyOpenAiError(403,{error:{message:'Missing scopes: model.request'}},'report').category,'model_request_permission');
 assert.equal(classifyOpenAiError(403,{error:{code:'unsupported_country_region_territory'}},'models').category,'region_restricted');
});
test('OpenAI quota and rate limiting remain distinct; raw messages cannot leak',()=>{
 assert.equal(classifyOpenAiError(429,{error:{code:'insufficient_quota'}},'report').category,'billing');
 const failure=classifyOpenAiError(429,{error:{message:'credential-sentinel-private-data'}},'report');
 assert.equal(failure.category,'rate_limit');assert.ok(!JSON.stringify(failure).includes('credential-sentinel'));
});
const fixture=(id,goals=2)=>({id,starting_at_timestamp:1000+id,state:{state:'FT'},participants:[{id:10,name:'Home',meta:{location:'home'}},{id:20,name:'Away',meta:{location:'away'}}],scores:[{description:'2ND_HALF',score:{participant:'home',goals}},{description:'2ND_HALF',score:{participant:'away',goals:1}},{description:'CURRENT',score:{participant:'home',goals:99}}]});
test('Sportmonks history excludes duplicates, future, wrong venue, unfinished and missing 90-minute scores',()=>{
 const base=fixture(1),future={...fixture(2),starting_at_timestamp:9999},unfinished={...fixture(3),state:{state:'LIVE'}},no90={...fixture(4),scores:[{description:'CURRENT',score:{participant:'home',goals:5}}]};
 const h=historicalGoalMeans([base,base,future,unfinished,no90],10,'home',2000000);
 assert.deepEqual(h,{sample:1,for:2,against:1});assert.equal(historicalGoalMeans([base],10,'away',2000000).sample,0);
 assert.equal(historicalGoalMeans([],10,'home',2000000).for,null);
});
test('Sportmonks maps countries explicitly and namespaces fixture identifiers',()=>{
 assert.equal(sportmonksCompetition({name:'Serie A',country:{name:'Brazil'}}),null);
 const m=sportmonksFixture({...fixture(42),league:{name:'Serie A',country:{name:'Italy'}}});
 assert.equal(m.id,'sm-42');assert.equal(m.competition,'Serie A');assert.equal(m.lambdaHome,null);assert.equal(m.counts,undefined);
});
test('Odds retains bookmaker, line and timestamp while rejecting malformed prices',()=>{
 const d=cleanOddsQuotes({id:'event-123',home_team:'Home',away_team:'Away',commence_time:'2030-01-01T15:00:00Z',bookmakers:[{title:'Example operator',markets:[{key:'totals_corners',last_update:'2026-11-19T00:00:00Z',outcomes:[{name:'Over',point:9.5,price:1.95},{name:'Under',point:9.5,price:null},{name:'Other',price:0}]}]}]});
 assert.equal(d.quotes.length,1);assert.equal(d.quotes[0].line,9.5);assert.equal(d.quotes[0].bookmaker,'Example operator');assert.equal(d.quotes[0].price,1.95);
});

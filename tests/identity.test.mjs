import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifyAccessJwt,accessTokenFrom,normalizeTeamDomain} from '../lib/access-jwt.ts';
import {diagnoseOpenAi} from '../lib/openai-errors.ts';

const team='quorum-test.cloudflareaccess.com',aud='aud-quorum-123';
const b64=(obj)=>Buffer.from(typeof obj==='string'?obj:JSON.stringify(obj)).toString('base64url');
const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const other=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk=await crypto.subtle.exportKey('jwk',pair.publicKey);
const keys=[{kid:'k1',kty:'RSA',n:jwk.n,e:jwk.e}];
const now=1_800_000_000;
async function sign(claims,{kid='k1',key=pair.privateKey,alg='RS256'}={}){
  const head=b64({alg,kid,typ:'JWT'}),body=b64(claims);
  const sig=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,new TextEncoder().encode(head+'.'+body));
  return head+'.'+body+'.'+Buffer.from(sig).toString('base64url');
}
const good={sub:'user-1',email:'Emiliano@Example.com',aud:[aud],iss:'https://'+team,exp:now+600,iat:now};
const cfg={teamDomain:team,audience:aud};

test('Access JWT: valid token accepted',async()=>{
  const c=await verifyAccessJwt(await sign(good),cfg,{keys,nowSeconds:now});
  assert.equal(c.sub,'user-1');
});
test('Access JWT: forged, foreign, expired, wrong audience/issuer and alg=none are rejected',async()=>{
  assert.equal(await verifyAccessJwt(await sign(good,{key:other.privateKey}),cfg,{keys,nowSeconds:now}),null);
  assert.equal(await verifyAccessJwt(await sign({...good,exp:now-3600}),cfg,{keys,nowSeconds:now}),null);
  assert.equal(await verifyAccessJwt(await sign({...good,aud:['someone-else']}),cfg,{keys,nowSeconds:now}),null);
  assert.equal(await verifyAccessJwt(await sign({...good,iss:'https://evil.cloudflareaccess.com'}),cfg,{keys,nowSeconds:now}),null);
  assert.equal(await verifyAccessJwt(await sign(good,{kid:'unknown'}),cfg,{keys,nowSeconds:now}),null);
  const unsigned=b64({alg:'none',kid:'k1'})+'.'+b64(good)+'.';
  assert.equal(await verifyAccessJwt(unsigned,cfg,{keys,nowSeconds:now}),null);
  // Tampered payload with the original signature.
  const t=(await sign(good)).split('.');t[1]=b64({...good,email:'attacker@example.com'});
  assert.equal(await verifyAccessJwt(t.join('.'),cfg,{keys,nowSeconds:now}),null);
  assert.equal(await verifyAccessJwt(null,cfg,{keys,nowSeconds:now}),null);
});
test('Access JWT: token read from header or cookie; team domain validated',()=>{
  assert.equal(accessTokenFrom(new Headers({'cf-access-jwt-assertion':'abc'})),'abc');
  assert.equal(accessTokenFrom(new Headers({cookie:'a=1; CF_Authorization=xyz'})),'xyz');
  assert.equal(accessTokenFrom(new Headers({'oai-authenticated-user-id':'spoof'})),null);
  assert.throws(()=>normalizeTeamDomain('evil.com'));
});

const json=(status,body,headers={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json',...headers}});
test('OpenAI diagnosis: Responses works without List models → key usable and saved-worthy',async()=>{
  const fetcher=async(url)=>String(url).includes('cdn-cgi/trace')?new Response('colo=FCO\nloc=IT\n'):String(url).endsWith('/v1/models')?json(401,{error:{message:'You have insufficient permissions for this operation. Missing scopes: api.model.read.'}},{'x-request-id':'req_abc123'}):json(200,{status:'completed',model:'gpt-6.1-sol'});
  const d=await diagnoseOpenAi('sk-test','gpt-6.1-sol',fetcher);
  assert.equal(d.usable,true);assert.equal(d.keyRecognized,true);
  const models=d.steps.find(s=>s.step==='models');assert.equal(models.category,'model_list_permission');assert.equal(models.requestId,'req_abc123');
  assert.match(d.steps[0].detail,/IT/);
});
test('OpenAI diagnosis: region block is named, not blamed on permissions or billing; raw text never leaks',async()=>{
  const body={error:{code:'unsupported_country_region_territory',type:'request_forbidden',message:'Country, region, or territory not supported sk-secret-leak'}};
  const fetcher=async(url)=>String(url).includes('cdn-cgi/trace')?new Response('colo=HKG\nloc=HK\n'):json(403,body);
  const d=await diagnoseOpenAi('sk-test','gpt-6.1-sol',fetcher);
  assert.equal(d.usable,false);assert.equal(d.keyRecognized,false);
  assert.ok(d.steps.filter(s=>s.step!=='egress').every(s=>s.category==='region_restricted'&&s.code==='unsupported_country_region_territory'));
  assert.ok(!JSON.stringify(d).includes('sk-secret-leak'));
});
test('OpenAI diagnosis: unknown model reported with visible alternatives',async()=>{
  const fetcher=async(url)=>String(url).includes('cdn-cgi/trace')?new Response(''):String(url).endsWith('/v1/models')?json(200,{data:[{id:'gpt-6.1-sol'},{id:'gpt-6-luna'},{id:'text-embedding-3-small'}]}):json(404,{error:{code:'model_not_found'}});
  const d=await diagnoseOpenAi('sk-test','gpt-6.2-sol',fetcher);
  assert.equal(d.usable,false);assert.equal(d.keyRecognized,true);assert.equal(d.modelListed,false);
  assert.deepEqual(d.visibleModels,['gpt-6-luna','gpt-6.1-sol']);
  assert.equal(d.steps.find(s=>s.step==='responses').category,'model_access');
});

test('OpenAI diagnosis: exhausted credit still proves the key is valid (saved, not usable)',async()=>{
  const fetcher=async(url)=>String(url).includes('cdn-cgi/trace')?new Response('colo=FRA\nloc=IT\n'):String(url).endsWith('/v1/models')?json(403,{error:{message:'You have insufficient permissions for this operation. Missing scopes: api.model.read.'}}):json(429,{error:{code:'insufficient_quota',type:'insufficient_quota',message:'credit balance exhausted'}});
  const d=await diagnoseOpenAi('sk-test','gpt-6.1-sol',fetcher);
  assert.equal(d.usable,false);assert.equal(d.keyRecognized,true);
  assert.equal(d.steps.find(s=>s.step==='responses').category,'billing');
});

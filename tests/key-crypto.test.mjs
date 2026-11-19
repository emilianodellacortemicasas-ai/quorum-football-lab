import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sealCredential,openCredential,validCredential} from '../lib/key-crypto.ts';
const pair=await crypto.subtle.generateKey({name:'RSA-OAEP',modulusLength:4096,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['encrypt','decrypt']);
const publicJwk=await crypto.subtle.exportKey('jwk',pair.publicKey),privateJwk=await crypto.subtle.exportKey('jwk',pair.privateKey);
const dummy='sk-proj-'+ 'testonly'.repeat(12),recipient='unit-test-recipient';
test('credential encryption round-trips without sending plaintext, and is randomized',async()=>{
 const a=await sealCredential(dummy,publicJwk,'openai',recipient),b=await sealCredential(dummy,publicJwk,'openai',recipient);
 assert.notEqual(a,b);assert.equal(a.length,683);assert.ok(!a.includes(dummy));assert.equal(await openCredential(a,privateJwk,'openai',recipient),dummy);
 const body=JSON.stringify({provider:'openai',ciphertext:a,recipientId:recipient});assert.ok(!body.includes(dummy));
});
test('ciphertext cannot be moved to another provider or recipient',async()=>{
 const a=await sealCredential(dummy,publicJwk,'openai',recipient);
 await assert.rejects(()=>openCredential(a,privateJwk,'api-football',recipient));
 await assert.rejects(()=>openCredential(a,privateJwk,'openai','another-recipient'));
});
test('modified ciphertext and oversized plaintext are rejected',async()=>{
 const a=await sealCredential(dummy,publicJwk,'openai',recipient);
 await assert.rejects(()=>openCredential((a[0]==='A'?'B':'A')+a.slice(1),privateJwk,'openai',recipient));
 await assert.rejects(()=>sealCredential('x'.repeat(401),publicJwk,'openai',recipient));
});
test('credential formats reject partial keys, whitespace and control characters',()=>{
 assert.equal(validCredential(dummy,'openai'),true);assert.equal(validCredential('proj_abc','openai'),false);assert.equal(validCredential(dummy+'\n','openai'),false);assert.equal(validCredential('a'.repeat(32),'api-football'),true);assert.equal(validCredential('bad key value','api-football'),false);
});

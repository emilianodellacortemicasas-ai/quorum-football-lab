export type CredentialProvider = 'openai' | 'api-football' | 'sportmonks' | 'the-odds-api';
const labelFor=(provider:CredentialProvider,recipientId:string)=>new TextEncoder().encode('QUORUM|credentials|v1|'+provider+'|'+recipientId);
export function toBase64Url(bytes:Uint8Array){return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
export function fromBase64Url(value:string){
  if(!/^[A-Za-z0-9_-]+$/.test(value)||value.length>1500)throw new Error('Dato cifrato non valido.');
  const s=value.replace(/-/g,'+').replace(/_/g,'/');
  return Uint8Array.from(atob(s+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));
}
export async function sealCredential(value:string,publicJwk:JsonWebKey,provider:CredentialProvider,recipientId:string){
  const plain=new TextEncoder().encode(value.trim());
  if(plain.length<12||plain.length>400)throw new Error('Controlla la lunghezza della chiave.');
  const key=await crypto.subtle.importKey('jwk',{kty:publicJwk.kty,n:publicJwk.n,e:publicJwk.e},{name:'RSA-OAEP',hash:'SHA-256'},false,['encrypt']);
  const encrypted=await crypto.subtle.encrypt({name:'RSA-OAEP',label:labelFor(provider,recipientId)},key,plain);
  return toBase64Url(new Uint8Array(encrypted));
}
export async function openCredential(ciphertext:string,privateJwk:JsonWebKey,provider:CredentialProvider,recipientId:string){
  const key=await crypto.subtle.importKey('jwk',privateJwk,{name:'RSA-OAEP',hash:'SHA-256'},false,['decrypt']);
  const plain=await crypto.subtle.decrypt({name:'RSA-OAEP',label:labelFor(provider,recipientId)},key,fromBase64Url(ciphertext));
  return new TextDecoder('utf-8',{fatal:true}).decode(plain);
}
export function validCredential(value:string,provider:CredentialProvider){
  return provider==='openai'?/^sk-[A-Za-z0-9_-]{20,390}$/.test(value):/^[A-Za-z0-9_.-]{12,350}$/.test(value);
}

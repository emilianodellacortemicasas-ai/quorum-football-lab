import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { serviceCredentials } from '../db/schema';
import { openCredential,validCredential,type CredentialProvider } from './key-crypto';

const runtime=()=>env as unknown as Record<string,string|undefined>;
export function vaultPublicConfiguration(){
  const e=runtime();
  if(!e.QUORUM_KEY_PRIVATE_JWK||!e.QUORUM_KEY_PUBLIC_JWK||!e.QUORUM_KEY_RECIPIENT_ID)return null;
  try{const p=JSON.parse(e.QUORUM_KEY_PUBLIC_JWK);return {recipientId:e.QUORUM_KEY_RECIPIENT_ID,publicKey:{kty:p.kty,n:p.n,e:p.e}};}catch{return null;}
}
// gpt-6.2-sol (previous default) is not in OpenAI's public catalog as of Nov 2026. The diagnosis confirms availability per project.
export const reportModel=()=>runtime().OPENAI_MODEL||'gpt-6.1-sol';
export async function credentialExists(provider:CredentialProvider){
  const e=runtime(),legacy=provider==='openai'?e.OPENAI_API_KEY:provider==='api-football'?e.API_FOOTBALL_KEY:provider==='sportmonks'?e.SPORTMONKS_API_KEY:provider==='oddspapi'?e.ODDSPAPI_KEY:provider==='stripe'?e.STRIPE_SECRET_KEY:provider==='stripe-webhook'?e.STRIPE_WEBHOOK_SECRET:e.ODDS_API_KEY;
  if(legacy)return true;
  const c=vaultPublicConfiguration();if(!c)return false;
  const rows=await getDb().select({recipientId:serviceCredentials.recipientId}).from(serviceCredentials).where(eq(serviceCredentials.provider,provider));
  return rows[0]?.recipientId===c.recipientId;
}
export async function decryptIncoming(ciphertext:string,provider:CredentialProvider,recipientId:string){
  const c=vaultPublicConfiguration();if(!c||c.recipientId!==recipientId)throw new Error('Configurazione di sicurezza aggiornata: ricarica la pagina.');
  let key:string;
  try{key=await openCredential(ciphertext,JSON.parse(runtime().QUORUM_KEY_PRIVATE_JWK!),provider,recipientId);}catch{throw new Error('Impossibile leggere il dato cifrato. Ricarica la pagina e riprova.');}
  if(!validCredential(key,provider))throw new Error('Formato della chiave non valido.');
  return key;
}
export async function credentialValue(provider:CredentialProvider){
  const e=runtime(),legacy=provider==='openai'?e.OPENAI_API_KEY:provider==='api-football'?e.API_FOOTBALL_KEY:provider==='sportmonks'?e.SPORTMONKS_API_KEY:provider==='oddspapi'?e.ODDSPAPI_KEY:provider==='stripe'?e.STRIPE_SECRET_KEY:provider==='stripe-webhook'?e.STRIPE_WEBHOOK_SECRET:e.ODDS_API_KEY;
  if(legacy)return legacy;
  if(!vaultPublicConfiguration())return null;
  const row=(await getDb().select().from(serviceCredentials).where(eq(serviceCredentials.provider,provider)))[0];
  if(!row)return null;
  return decryptIncoming(row.ciphertext,provider,row.recipientId);
}
export async function reserveOperation(id:string,limit:number){
  const r=await env.DB!.prepare('INSERT INTO operation_counters (id,count) VALUES (?,1) ON CONFLICT(id) DO UPDATE SET count=count+1 WHERE count<? RETURNING count').bind(id,limit).first<{count:number}>();
  return r?.count??null;
}
export async function connectionStatuses(){
  const [openai,football,sportmonks,odds,oddspapi,stripe,stripeWebhook]=await Promise.all([credentialExists('openai'),credentialExists('api-football'),credentialExists('sportmonks'),credentialExists('the-odds-api'),credentialExists('oddspapi'),credentialExists('stripe'),credentialExists('stripe-webhook')]);
  return {openai,football,sportmonks,odds,oddspapi,stripe,stripeWebhook,model:reportModel()};
}

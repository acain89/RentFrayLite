import { publicJson } from "@/lib/publicJson";
export type CredentialEnvironment=Record<string,string|undefined>;
export class CredentialRequestInvalid extends Error {}
export const PRIVATE_CREDENTIAL_HEADERS={"Cache-Control":"no-store, max-age=0","Referrer-Policy":"no-referrer","X-Robots-Tag":"noindex, nofollow"};
export function configuredCredentialOrigin(env:CredentialEnvironment=process.env,httpsOnly=false){
  const url=new URL(env.NEXT_PUBLIC_BASE_URL??"");
  if(url.username||url.password||url.pathname!=="/"||url.search||url.hash||!["https:","http:"].includes(url.protocol))throw new CredentialRequestInvalid("Credential origin unavailable.");
  const local=["localhost","127.0.0.1","[::1]"].includes(url.hostname);
  if(url.protocol!=="https:"&&(httpsOnly||env.NODE_ENV==="production"||!local))throw new CredentialRequestInvalid("HTTPS credential origin required.");
  if(httpsOnly&&local)throw new CredentialRequestInvalid("Public credential origin required.");
  return url.origin;
}
export function requireCredentialOrigin(request:Request,env:CredentialEnvironment=process.env){
  const origin=configuredCredentialOrigin(env);
  if(request.headers.get("origin")!==origin||request.headers.get("sec-fetch-site")==="cross-site")throw new CredentialRequestInvalid("Invalid request origin.");
}
export async function credentialJson(request:Request):Promise<Record<string,unknown>>{
  try { return await publicJson(request,4096); }
  catch { throw new CredentialRequestInvalid("Invalid request body."); }
}

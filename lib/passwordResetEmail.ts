import {configuredCredentialOrigin,type CredentialEnvironment} from "@/lib/credentialRequest";
export type PasswordResetEmail={to:string;subject:string;text:string;html:string};
// true means provider acceptance only, never confirmed inbox delivery.
export type PasswordResetEmailSender={send(message:PasswordResetEmail):Promise<boolean>};
export const RECOVERY_UNAVAILABLE_MESSAGE="Self-service password recovery is currently unavailable. Contact your business administrator for assistance.";

function localHost(url:URL){
  const host=url.hostname.toLowerCase().replace(/\.$/,"");
  return host==="localhost"||host.endsWith(".localhost")||/^127\./.test(host)||host==="[::1]";
}

// Server-side configuration inspection only: no DNS, provider call or delivery
// attestation. Never return configuration values to a page or public response.
function recoveryConfiguration(env:CredentialEnvironment){
  try{
    if(!env.NEXT_PUBLIC_BASE_URL||/[\s\x00-\x1f\x7f]/.test(env.NEXT_PUBLIC_BASE_URL))return null;
    const origin=configuredCredentialOrigin(env,true);
    if(localHost(new URL(origin)))return null;
    const api=env.RFL_EMAIL_API_URL,token=env.RFL_EMAIL_API_TOKEN,from=env.RFL_EMAIL_FROM;
    if(!api||/[\s\x00-\x1f\x7f]/.test(api)||!token||!from||!/^[-A-Za-z0-9._~+/]+=*$/.test(token))return null;
    const endpoint=new URL(api);
    if(endpoint.protocol!=="https:"||endpoint.username||endpoint.password||api.includes("?")||api.includes("#")||
      localHost(endpoint))return null;
    if(from.length>254||!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+$/.test(from))return null;
    const [local,domain]=from.split("@");
    if(local.length>64||local.startsWith(".")||local.endsWith(".")||local.includes("..")||!domain.includes(".")||
      domain.split(".").some(label=>!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label)))return null;
    return {origin,endpoint,token,from};
  }catch{return null;}
}
export function passwordRecoveryReady(env:CredentialEnvironment=process.env):boolean{
  return recoveryConfiguration(env)!==null;
}
/** Provider-neutral HTTPS JSON gateway contract. No SDK, retries, token logging,
 * analytics, or link rewriting. Leave unconfigured until a trusted transactional
 * gateway and verified sender are supplied. No request headers choose this URL. */
export function passwordResetEmailSender(env:CredentialEnvironment=process.env,transport:typeof fetch=fetch):PasswordResetEmailSender{
  return {async send(message){
    const config=recoveryConfiguration(env);if(!config)return false;
    try{
      const result=await transport(config.endpoint,{method:"POST",redirect:"error",signal:AbortSignal.timeout(1200),headers:{"content-type":"application/json",authorization:"Bearer "+config.token},body:JSON.stringify({from:config.from,...message})});
      return result.ok;
    }catch{return false;}
  }};
}
export function passwordResetEmail(to:string,url:string):PasswordResetEmail {
  const message="Use this link within 30 minutes to reset your RentFrayLite management password. If you did not request this, ignore this email. Your password has not changed.";
  return {to,subject:"Reset your RentFrayLite password",text:message+"\n\n"+url,html:"<p>"+message+"</p><p><a href=\""+url+"\">Reset password</a></p>"};
}

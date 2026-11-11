import {prisma} from "@/lib/prisma";
import {credentialJson,requireCredentialOrigin,PRIVATE_CREDENTIAL_HEADERS} from "@/lib/credentialRequest";
import {requestManagementPasswordReset,RESET_REQUEST_CONFIRMATION} from "@/lib/passwordRecovery";
import {passwordResetEmailSender,passwordRecoveryReady,RECOVERY_UNAVAILABLE_MESSAGE} from "@/lib/passwordResetEmail";
import {reserveManagementAttempt} from "@/lib/managementLoginThrottle";
export const runtime="nodejs";
export async function POST(request:Request){
  try{requireCredentialOrigin(request);}catch{return Response.json({error:"Invalid request origin."},{status:403,headers:PRIVATE_CREDENTIAL_HEADERS});}
  const started=performance.now();
  const ready=passwordRecoveryReady();
  try{const body=await credentialJson(request),email=typeof body.email==="string"?body.email.trim().toLowerCase():"";
    if(email.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)&&await reserveManagementAttempt(prisma,"RESET_REQUEST",email))await requestManagementPasswordReset(prisma,email,passwordResetEmailSender());
  }catch{/* Generic public response; never log email payloads or tokens. */}
  // Bound email transport timeout is 1.2s. Pad ordinary paths to reduce timing disclosure.
  const remaining=2000-(performance.now()-started);if(remaining>0)await new Promise(resolve=>setTimeout(resolve,remaining));
  return Response.json({message:ready?RESET_REQUEST_CONFIRMATION:RECOVERY_UNAVAILABLE_MESSAGE},{headers:PRIVATE_CREDENTIAL_HEADERS});
}

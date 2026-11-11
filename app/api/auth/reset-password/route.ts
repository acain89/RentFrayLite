import {prisma} from "@/lib/prisma";
import {credentialJson,requireCredentialOrigin,PRIVATE_CREDENTIAL_HEADERS} from "@/lib/credentialRequest";
import {consumeManagementPasswordReset} from "@/lib/passwordRecovery";
import {reserveManagementAttempt} from "@/lib/managementLoginThrottle";
export const runtime="nodejs";
export async function POST(request:Request){
  try{requireCredentialOrigin(request);}catch{return Response.json({error:"Invalid request origin."},{status:403,headers:PRIVATE_CREDENTIAL_HEADERS});}
  try{const body=await credentialJson(request);const token=typeof body.token==="string"&&body.token.length<=100?body.token:"invalid";
    if(!await reserveManagementAttempt(prisma,"RESET_SUBMIT",token))return Response.json({error:"Unable to reset password. Please try again later."},{status:429,headers:{...PRIVATE_CREDENTIAL_HEADERS,"Retry-After":"600"}});
    if(await consumeManagementPasswordReset(prisma,token,body.password,body.confirmPassword))return Response.json({reset:true,redirectTo:"/login/manager"},{headers:PRIVATE_CREDENTIAL_HEADERS});
  }catch{/* Fail closed without exposing submitted credentials or internal errors. */}
  return Response.json({error:"Unable to reset password. Request a new link and check the password requirements."},{status:400,headers:PRIVATE_CREDENTIAL_HEADERS});
}

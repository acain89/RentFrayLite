import { publicJson, publicJsonFailure } from "@/lib/publicJson";
import { SessionType } from "@prisma/client";
import { requireCredentialOrigin } from "@/lib/credentialRequest";
import { getCurrentSession } from "@/lib/session";
import { withManagerMutation, ManagerMutationUnauthorized } from "@/lib/managerMutation";
import { updateManagementSms, SmsSettingsInvalid } from "@/lib/managementSms";
export async function POST(request:Request){
  const session=await getCurrentSession();
  if(!session||session.type!==SessionType.MANAGER||!session.manager||!session.business)return Response.json({error:"Unauthorized."},{status:401});
  try{requireCredentialOrigin(request);}catch{return Response.json({error:"Invalid request origin."},{status:403});}
  let body:unknown;try{body=await publicJson(request, 4096);}catch(error){return publicJsonFailure(error);}
  try{await withManagerMutation(session,async tx=>{const business=await tx.business.findUniqueOrThrow({where:{id:session.business!.id}});await updateManagementSms(tx,business,body);});return Response.json({saved:true});}
  catch(e){return Response.json({error:e instanceof SmsSettingsInvalid?e.message:"Unable to save SMS settings."},{status:e instanceof SmsSettingsInvalid?400:e instanceof ManagerMutationUnauthorized?401:500});}
}

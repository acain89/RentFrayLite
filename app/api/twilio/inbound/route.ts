import { prisma } from "@/lib/prisma";
import { createHash, randomUUID } from "node:crypto";
import { logOperationalError } from "@/lib/operationalLogging";
import { applySmsOptOut, SmsCallbackInvalid } from "@/lib/smsDelivery";
export const runtime="nodejs";
export async function POST(request:Request){
  try{const response=await applySmsOptOut(prisma,request);return new Response(response,{status:200,headers:{"content-type":"text/xml","cache-control":"no-store"}});}
  catch(error){
    if(error instanceof SmsCallbackInvalid)return new Response(null,{status:403,headers:{"cache-control":"no-store"}});
    const reference=randomUUID();
    logOperationalError("sms_inbound_callback_failed",error,reference);
    return new Response(null,{status:503,headers:{"cache-control":"no-store","X-RFL-Correlation":createHash("sha256").update(reference).digest("hex")}});
  }
}

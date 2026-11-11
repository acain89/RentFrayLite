import { prisma } from "@/lib/prisma";
import { createHash, randomUUID } from "node:crypto";
import { logOperationalError } from "@/lib/operationalLogging";
import { applySmsStatus, SmsCallbackInvalid } from "@/lib/smsDelivery";
export const runtime="nodejs";
export async function POST(request:Request){
  try{await applySmsStatus(prisma,request);return new Response(null,{status:200,headers:{"content-type":"text/xml","cache-control":"no-store"}});}
  catch(error){
    if(error instanceof SmsCallbackInvalid)return new Response(null,{status:403,headers:{"cache-control":"no-store"}});
    const reference=randomUUID();
    logOperationalError("sms_status_callback_failed",error,reference);
    return new Response(null,{status:503,headers:{"cache-control":"no-store","X-RFL-Correlation":createHash("sha256").update(reference).digest("hex")}});
  }
}

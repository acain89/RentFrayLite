import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
export { isNewManagementPassword, MANAGEMENT_PASSWORD_REQUIREMENT } from "@/lib/managementPasswordPolicy";
// Preserve existing short/long bcrypt credentials until a legitimate change.
// Every newly chosen credential is bounded above to avoid bcrypt truncation.
export function isManagementLoginPassword(value:unknown):value is string {
  return typeof value==="string"&&value.length>=6&&value.length<=128&&!value.includes("\0")&&Buffer.from(value,"utf8").toString("utf8")===value;
}
export function managementCredentialFingerprint(m:{id:string;businessId:string;email:string;passwordHash:string}){
  return createHash("sha256").update(JSON.stringify([m.id,m.businessId,m.email,m.passwordHash])).digest("hex");
}
export async function invalidateManagementResetTokens(tx:Prisma.TransactionClient,businessId:string,now=new Date()){
  await tx.verificationToken.updateMany({where:{businessId,type:"PASSWORD_RESET",usedAt:null},data:{usedAt:now}});
}

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
export const MANAGEMENT_PASSWORD_REQUIREMENT="Use at least 12 characters excluding outer whitespace and at most 72 UTF-8 bytes. NUL characters and malformed Unicode are not supported.";
export function isNewManagementPassword(value:unknown):value is string {
  return typeof value==="string"&&value.length<=72&&Array.from(value.trim()).length>=12&&Buffer.byteLength(value,"utf8")<=72&&!value.includes("\0")&&Buffer.from(value,"utf8").toString("utf8")===value;
}
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

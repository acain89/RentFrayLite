import {createHash,randomBytes} from "node:crypto";
import {Prisma,type PrismaClient} from "@prisma/client";
import {hashPassword} from "@/lib/password";
import {isNewManagementPassword,managementCredentialFingerprint,invalidateManagementResetTokens} from "@/lib/managementCredential";
import {configuredCredentialOrigin,type CredentialEnvironment} from "@/lib/credentialRequest";
import {passwordResetEmail,passwordRecoveryReady,type PasswordResetEmailSender} from "@/lib/passwordResetEmail";
export const RESET_REQUEST_CONFIRMATION="If an eligible account exists and recovery is available, a reset email may be sent. Delivery is not confirmed. Check your inbox and spam folder, or contact your business administrator for assistance.";
export const RESET_TOKEN_LIFETIME_MS=30*60*1000;
export const resetTokenHash=(token:string)=>createHash("sha256").update(token).digest("hex");
const TX={isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted,maxWait:3000,timeout:10000};
const eligible=(m:{isActive:boolean;business:{isActive:boolean;status:string}}|null)=>!!m?.isActive&&m.business.isActive&&m.business.status!=="DISABLED";
export async function requestManagementPasswordReset(db:PrismaClient,email:string,sender:PasswordResetEmailSender,env:CredentialEnvironment=process.env){
  if(!passwordRecoveryReady(env))return;
  // Configuration failure is indistinguishable from an unknown account publicly.
  let origin:string;try{origin=configuredCredentialOrigin(env,true);}catch{return;}
  const manager=await db.manager.findUnique({where:{email},include:{business:true}});if(!eligible(manager)||!manager)return;
  const raw=randomBytes(32).toString("base64url"),tokenHash=resetTokenHash(raw);
  const token=await db.$transaction(async tx=>{
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Business" WHERE "id"=${manager.businessId} FOR NO KEY UPDATE`);
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Manager" WHERE "id"=${manager.id} FOR UPDATE`);
    const current=await tx.manager.findUnique({where:{id:manager.id},include:{business:true}});
    if(!eligible(current)||!current||current.email!==email||managementCredentialFingerprint(current)!==managementCredentialFingerprint(manager))return null;
    const [clock]=await tx.$queryRaw<{now:Date}[]>(Prisma.sql`SELECT clock_timestamp() AS now`);
    return tx.verificationToken.create({data:{businessId:current.businessId,type:"PASSWORD_RESET",tokenHash,credentialFingerprint:managementCredentialFingerprint(current),expiresAt:new Date(clock.now.getTime()+RESET_TOKEN_LIFETIME_MS)}});
  },TX);
  if(!token)return;
  let sent=false;try{sent=await sender.send(passwordResetEmail(email,origin+"/login/manager/reset-password#token="+encodeURIComponent(raw)));}catch{/* Never log provider payloads or the token. */}
  if(!sent){await db.verificationToken.updateMany({where:{id:token.id,usedAt:null},data:{usedAt:new Date()}});
    await db.auditLog.create({data:{businessId:manager.businessId,actorType:"SECURITY",action:"PASSWORD_RESET_EMAIL_UNAVAILABLE",targetType:"MANAGER",targetId:manager.id,summary:"Recovery email delivery unavailable or unconfirmed; request a new link."}});}
}
export async function consumeManagementPasswordReset(db:PrismaClient,raw:unknown,password:unknown,confirm:unknown){
  if(typeof raw!=="string"||!/^[A-Za-z0-9_-]{43}$/.test(raw)||!isNewManagementPassword(password)||password!==confirm)return false;
  const token=await db.verificationToken.findUnique({where:{tokenHash:resetTokenHash(raw)}});
  if(!token||token.type!=="PASSWORD_RESET"||token.usedAt||!token.credentialFingerprint)return false;
  const [observedClock]=await db.$queryRaw<{now:Date}[]>(Prisma.sql`SELECT clock_timestamp() AS now`);
  if(token.expiresAt<=observedClock.now)return false;
  const manager=await db.manager.findUnique({where:{businessId:token.businessId},include:{business:true}});
  if(!eligible(manager)||!manager||managementCredentialFingerprint(manager)!==token.credentialFingerprint)return false;
  // Bcrypt runs outside row locks. The locked transaction rechecks every fact.
  const passwordHash=await hashPassword(password);
  return db.$transaction(async tx=>{
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Business" WHERE "id"=${manager.businessId} FOR NO KEY UPDATE`);
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Manager" WHERE "id"=${manager.id} FOR UPDATE`);
    const current=await tx.manager.findUnique({where:{id:manager.id},include:{business:true}});
    const [clock]=await tx.$queryRaw<{now:Date}[]>(Prisma.sql`SELECT clock_timestamp() AS now`);
    if(!eligible(current)||!current||managementCredentialFingerprint(current)!==token.credentialFingerprint)return false;
    const consumed=await tx.verificationToken.updateMany({where:{id:token.id,businessId:current.businessId,type:"PASSWORD_RESET",credentialFingerprint:token.credentialFingerprint,usedAt:null,expiresAt:{gt:clock.now}},data:{usedAt:clock.now}});
    if(consumed.count!==1)return false;
    await tx.manager.update({where:{id:current.id,passwordHash:current.passwordHash,email:current.email,isActive:true},data:{passwordHash}});
    await invalidateManagementResetTokens(tx,current.businessId,clock.now);
    await tx.session.deleteMany({where:{managerId:current.id}});
    await tx.auditLog.create({data:{businessId:current.businessId,actorType:"SECURITY",action:"MANAGER_PASSWORD_RECOVERED",targetType:"MANAGER",targetId:current.id,summary:"Management password reset and sessions revoked."}});
    return true;
  },TX);
}

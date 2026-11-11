import {createHash} from "node:crypto";
import {Prisma,type PrismaClient} from "@prisma/client";
export const MANAGEMENT_AUTH_LIMITS={LOGIN:{limit:10,windowMs:600000,globalLimit:300},RESET_REQUEST:{limit:3,windowMs:1800000,globalLimit:100},RESET_SUBMIT:{limit:10,windowMs:600000,globalLimit:100}} as const;
export type ManagementAttempt=keyof typeof MANAGEMENT_AUTH_LIMITS;
/** Durable audit reservations, protected by a short advisory transaction. Neither
 * spoofable forwarding headers nor process-local counters establish a budget.
 * Denials do not extend windows; recovery and login have independent budgets. */
export async function reserveManagementAttempt(db:PrismaClient,kind:ManagementAttempt,identifier:string){
  const p=MANAGEMENT_AUTH_LIMITS[kind],action="MANAGEMENT_"+kind+"_RESERVED",targetId=createHash("sha256").update("rfl-auth-v1:"+kind+":"+identifier).digest("hex");
  return db.$transaction(async tx=>{
    await tx.$queryRaw(Prisma.sql`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${"rfl-auth-v1:"+kind},0))`);
    const [clock]=await tx.$queryRaw<{now:Date}[]>(Prisma.sql`SELECT clock_timestamp() AS now`);
    const global=await tx.auditLog.count({where:{action,createdAt:{gt:new Date(clock.now.getTime()-300000)}}});
    const account=await tx.auditLog.count({where:{action,targetId,createdAt:{gt:new Date(clock.now.getTime()-p.windowMs)}}});
    if(global>=p.globalLimit||account>=p.limit)return false;
    await tx.auditLog.create({data:{actorType:"SECURITY",action,targetType:"MANAGEMENT_AUTH",targetId,summary:"Management authentication operation reserved.",createdAt:clock.now}});
    return true;
  },{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted,maxWait:2000,timeout:5000});
}

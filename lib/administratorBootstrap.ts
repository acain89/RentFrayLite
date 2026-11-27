import type { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { requireAdminCredential } from "./adminCredential";
// Only LF/CRLF encodings of the same immutable RFL migration are accepted.
export const RFL_BOOTSTRAP_SCHEMA_CHECKSUMS = ["715b62d689c124900c60a6bc75561ee4c0e4e2a6c3fa6cb100bc7c0fec26a2ea","6fb8648b3a6c83894886ce9f9d64dd6bd780147139a402b4fc26d214179038d7"];
export interface AdministratorBootstrapTarget {
  database: string; databaseOid: string; owner: string; role: string; administratorId: string;
}
export function validateBootstrapTarget(value: AdministratorBootstrapTarget): void {
  if (!value || Object.keys(value).sort().join(",") !== "administratorId,database,databaseOid,owner,role" ||
    ![value.database,value.owner,value.role].every(text => typeof text === "string" && /^[A-Za-z0-9_-]{1,63}$/.test(text)) ||
    typeof value.databaseOid !== "string" || !/^[1-9]\d*$/.test(value.databaseOid) ||
    typeof value.administratorId !== "string" || !/^rfl-bootstrap-admin-[a-f0-9]{32}$/.test(value.administratorId)) throw Error("ADMIN_BOOTSTRAP_SCOPE_REJECTED");
}
/** Owner-operated first setup only. Never resets, deletes or overwrites an administrator. */
export async function bootstrapFirstAdministrator(db: PrismaClient, target: AdministratorBootstrapTarget, value: unknown, apply = false) {
  validateBootstrapTarget(target);
  const code = requireAdminCredential(value);
  const codeHash = apply ? await bcrypt.hash(code,12) : undefined;
  return db.$transaction(async tx => {
    await tx.$queryRawUnsafe("SELECT pg_advisory_xact_lock(hashtextextended('rfl-first-administrator-v1',0))::text");
    const rows = await tx.$queryRawUnsafe<Array<{ database: string; databaseoid: string; owner: string; username: string }>>("SELECT current_database() AS database,current_user AS username,oid::text AS databaseoid,pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=current_database()");
    const row = rows[0];
    if (rows.length !== 1 || !row || row.database !== target.database || row.databaseoid !== target.databaseOid || row.owner !== target.owner || row.username !== target.role) throw Error("ADMIN_BOOTSTRAP_IDENTITY_REJECTED");
    const schema=await tx.$queryRawUnsafe<Array<{checksum:string;finished_at:Date|null;rolled_back_at:Date|null}>>("SELECT checksum,finished_at,rolled_back_at FROM _prisma_migrations WHERE migration_name='20260715212807_rfl_initial_schema'");
    if(schema.length!==1||!RFL_BOOTSTRAP_SCHEMA_CHECKSUMS.includes(schema[0].checksum)||!schema[0].finished_at||schema[0].rolled_back_at!==null)throw Error("RFL_BOOTSTRAP_SCHEMA_REJECTED");
    if (await tx.adminAccess.count() !== 0) return { applied: false, eligible: false, scope: "first-administrator-only" };
    if (!apply || !codeHash) return { applied: false, eligible: true, scope: "first-administrator-only" };
    await tx.adminAccess.create({ data: { id: target.administratorId, codeHash } });
    return { applied: true, eligible: true, scope: "first-administrator-only" };
  },{ isolationLevel:"ReadCommitted",maxWait:10000,timeout:10000 });
}

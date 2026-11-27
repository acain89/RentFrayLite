// Explicit owner-operated initial setup; this utility never deletes/reset records.
// It is not run by startup, builds, migrations or recovery jobs.
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { bootstrapFirstAdministrator, validateBootstrapTarget, type AdministratorBootstrapTarget } from "../lib/administratorBootstrap";
async function main() {
  if (JSON.parse(readFileSync("package.json","utf8")).name !== "rentfraylite-platform") throw Error("RFL_PROJECT_REQUIRED");
  const args=process.argv.slice(2),values=new Map<string,string>();let apply=false;
  const names=new Set(["--database","--database-oid","--owner","--role","--administrator-id"]);
  for(let index=0;index<args.length;index++){
    const flag=args[index];if(flag==="--apply"&&!apply){apply=true;continue;}
    const value=args[++index];if(!names.has(flag)||values.has(flag)||!value||value.startsWith("--"))throw Error("ADMIN_BOOTSTRAP_SCOPE_REQUIRED");values.set(flag,value);
  }
  if(values.size!==names.size)throw Error("ADMIN_BOOTSTRAP_SCOPE_REQUIRED");
  const target:AdministratorBootstrapTarget={database:values.get("--database")??"",databaseOid:values.get("--database-oid")??"",owner:values.get("--owner")??"",role:values.get("--role")??"",administratorId:values.get("--administrator-id")??""};
  validateBootstrapTarget(target);
  const db=new PrismaClient();
  try{console.log(JSON.stringify(await bootstrapFirstAdministrator(db,target,process.env.SEED_ADMIN_CODE,apply)));}
  finally{await db.$disconnect();}
}
void main().catch(()=>{console.error("First administrator bootstrap rejected. Verify explicit scope and approved database identity; existing access is never reset.");process.exitCode=1;});

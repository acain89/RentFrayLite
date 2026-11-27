import { bootstrapFirstAdministrator } from "../lib/administratorBootstrap";
﻿import { execFileSync, spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readdirSync, lstatSync, mkdirSync, writeFileSync, readFileSync, appendFileSync, rmSync, realpathSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import net from "node:net";
import { pathToFileURL } from "node:url";
import { fingerprintFile, loadDisposableConfig, openDisposableDatabase, verifyDisposableIdentity, verifyOwnershipFile, type DisposableDatabaseConfig } from "../lib/disposableDatabase";

const root = realpathSync(process.cwd());
const nonce = randomBytes(16).toString("hex");
const data = path.join(os.tmpdir(), "rfl-b1-pg-" + nonce);
const evidence = path.join(os.tmpdir(), "rfl-acceptance-" + nonce);
const configFile = data + ".fixture.json", markerFile = data + ".owner.json", pwFile = data + ".password";
const bin = process.env.RFL_POSTGRES_BIN ?? "C:/Program Files/PostgreSQL/17/bin";
const executable = (name: string) => path.join(bin, name + (process.platform === "win32" ? ".exe" : ""));
const bootstrap = "rfl_bootstrap_" + nonce.slice(0, 12), password = randomBytes(32).toString("hex");
const role = "rfl_s5_" + nonce.slice(0, 12), owner = "rfl_owner_" + nonce.slice(0, 12), appPassword = randomBytes(32).toString("hex");
const clean = Object.fromEntries(Object.entries(process.env).filter(([key]) => ["PATH", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "PROGRAMFILES", "PROGRAMFILES(X86)"].includes(key.toUpperCase())));
const childEnv: NodeJS.ProcessEnv = { ...clean, NODE_ENV: "test", NEXT_TELEMETRY_DISABLED: "1" };
const stages: Array<{ name: string; code: number | null; log: string }> = [];
let port = 0, ownedPid = 0, started = false, config: DisposableDatabaseConfig | undefined, cleanup = false;
function native(name: string, args: string[], input?: string, database = "postgres") {
  const r = spawnSync(executable(name), args, { cwd: root, input, encoding: "utf8", windowsHide: true,
    ...(name === "pg_ctl" ? { stdio: "ignore" as const } : {}),
    env: { ...childEnv, PGPASSWORD: password, PGHOST: "127.0.0.1", PGPORT: String(port), PGUSER: bootstrap, PGDATABASE: database }, maxBuffer: 16 * 1024 * 1024 });
  if (r.error || r.status !== 0) throw Error("DISPOSABLE_NATIVE_" + name.toUpperCase() + "_FAILED");
  return r.stdout?.trim() ?? "";
}
function sql(text: string, database = "postgres") { return native("psql", ["-X", "-qAt", "-v", "ON_ERROR_STOP=1"], text, database); }
async function stage(name: string, args: string[], env: NodeJS.ProcessEnv) {
  if (!config) throw Error("MISSING_DISPOSABLE_PROOF");
  verifyOwnershipFile(config);
  const log = path.join(evidence, name + ".log");
  const child = spawn(process.execPath, args, { cwd: root, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", bytes => appendFileSync(log, bytes)); child.stderr.on("data", bytes => appendFileSync(log, bytes));
  const code = await new Promise<number | null>((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); });
  stages.push({ name, code, log });
  console.log(JSON.stringify({ stage: name, code }));
  if (code !== 0) throw Error("DISPOSABLE_STAGE_FAILED_" + name);
}
async function main() {
  if (JSON.parse(readFileSync(path.join(root,"package.json"),"utf8")).name !== "rentfraylite-platform") throw Error("RFL_PROJECT_REQUIRED");
  if (process.argv.slice(2).some(flag => flag !== "--isolation-only" && flag !== "--invariants-only")) throw Error("INVALID_ACCEPTANCE_ARGUMENTS");
  if (existsSync(data) || existsSync(evidence) || existsSync(markerFile) || existsSync(configFile)) throw Error("DISPOSABLE_PATH_ALREADY_EXISTS");
  const version = native("postgres", ["--version"]); if (!/PostgreSQL\) 17\./.test(version)) throw Error("POSTGRESQL_17_REQUIRED");
  mkdirSync(evidence); writeFileSync(pwFile, password, { mode: 0o600, flag: "wx" });
  const listener = net.createServer(); await new Promise<void>(resolve => listener.listen(0, "127.0.0.1", resolve));
  const address = listener.address(); if (!address || typeof address === "string") throw Error("PORT_RESERVATION_FAILED"); port = address.port;
  await new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
  native("initdb", ["-D", data, "-U", bootstrap, "--pwfile=" + pwFile, "--auth-local=scram-sha-256", "--auth-host=scram-sha-256", "--encoding=UTF8", "--locale=C"]);
  rmSync(pwFile);
  appendFileSync(path.join(data, "postgresql.conf"), `\nlisten_addresses='127.0.0.1'\nport=${port}\nmax_connections=80\ntimezone='UTC'\nshared_buffers='32MB'\nunix_socket_directories=''\n`);
  native("pg_ctl", ["-D", data, "-l", path.join(evidence, "postgres.log"), "-w", "start"]); started = true;
  ownedPid = Number(readFileSync(path.join(data,"postmaster.pid"),"utf8").split(/\r?\n/)[0]);
  const identity = JSON.parse(sql(`SELECT json_build_object('directory',current_setting('data_directory'),'version',current_setting('server_version_num'),'address',host(inet_server_addr()),'port',inet_server_port(),'systemId',(SELECT system_identifier::text FROM pg_control_system()),'startedAt',to_char(pg_postmaster_start_time() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'databases',(SELECT json_agg(datname ORDER BY datname) FROM pg_database WHERE NOT datistemplate))`));
  if (path.resolve(identity.directory).toLowerCase() !== path.resolve(data).toLowerCase() || identity.address !== "127.0.0.1" || identity.port !== port || typeof identity.systemId !== "string" || !/^\d{10,24}$/.test(identity.systemId) || typeof identity.startedAt !== "string" || !Number.isFinite(Date.parse(identity.startedAt)) || !String(identity.version).startsWith("17") || JSON.stringify(identity.databases) !== '["postgres"]') throw Error("FRESH_CLUSTER_IDENTITY_FAILED");
  sql(`CREATE ROLE ${owner} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; CREATE ROLE ${role} LOGIN PASSWORD '${appPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 64; CREATE DATABASE ${role} OWNER ${owner}; REVOKE CONNECT ON DATABASE postgres FROM PUBLIC; REVOKE CONNECT ON DATABASE template1 FROM PUBLIC; REVOKE ALL ON DATABASE ${role} FROM PUBLIC; GRANT CONNECT ON DATABASE ${role} TO ${role};`);
  sql(`REVOKE CREATE ON SCHEMA public FROM PUBLIC; CREATE SCHEMA rfl_fixture; CREATE TABLE rfl_fixture.identity(singleton boolean PRIMARY KEY CHECK(singleton),nonce text NOT NULL); INSERT INTO rfl_fixture.identity VALUES(true,'${nonce}'); REVOKE ALL ON SCHEMA rfl_fixture FROM PUBLIC; GRANT USAGE ON SCHEMA rfl_fixture TO ${role}; GRANT SELECT ON rfl_fixture.identity TO ${role}; GRANT pg_read_all_settings,pg_read_all_stats TO ${role}; GRANT EXECUTE ON FUNCTION pg_control_system() TO ${role};`, role);
  config = { isolationVerified: true, nonce, host: "127.0.0.1", port, role, database: role, owner, password: appPassword, data, project: root,
    systemId: identity.systemId, startedAt: identity.startedAt, pid: Number(readFileSync(path.join(data, "postmaster.pid"), "utf8").split(/\r?\n/)[0]), connectionLimit: 12, scopes: ["regression", "seed-admin"] };
  const { password: omitted, ...proof } = config; void omitted;
  writeFileSync(markerFile, JSON.stringify(proof), { mode: 0o600, flag: "wx" }); writeFileSync(configFile, JSON.stringify(config), { mode: 0o600, flag: "wx" });
  const administratorUrl = `postgresql://${bootstrap}:${password}@127.0.0.1:${port}/${role}?connection_limit=2`;
  await stage("migrations", ["node_modules/prisma/build/index.js", "migrate", "deploy"], { ...childEnv, DATABASE_URL: administratorUrl });
  sql(`GRANT USAGE ON SCHEMA public TO ${role}; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${role}; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role};`, role);
  const db = await openDisposableDatabase(loadDisposableConfig(["--rfl-test-db-config=" + configFile]));
  try {
    for (const query of ["CREATE TABLE public.unauthorized_probe(id int)", "DELETE FROM rfl_fixture.identity", "CREATE ROLE unauthorized_fixture_role", "CREATE DATABASE unauthorized_fixture_database", `SET ROLE ${owner}`, 'TRUNCATE TABLE "AdminAccess"']) {
      let rejected = false; try { await db.$executeRawUnsafe(query); } catch { rejected = true; } if (!rejected) throw Error("RESTRICTED_ROLE_PERMISSION_ACCEPTANCE_FAILED");
    }
    const databaseOid=sql("SELECT oid::text FROM pg_database WHERE datname=current_database()",role);
    const target={database:config.database,databaseOid,owner:config.owner,role:config.role,administratorId:"rfl-bootstrap-admin-"+nonce};
    if (!(await bootstrapFirstAdministrator(db,target,"000123")).eligible) throw Error("EMPTY_BOOTSTRAP_DRY_RUN_FAILED");
    const outcomes=await Promise.all([bootstrapFirstAdministrator(db,target,"000123",true),bootstrapFirstAdministrator(db,target,"000123",true)]);
    if(outcomes.filter(value=>value.applied).length!==1)throw Error("BOOTSTRAP_DUPLICATE_CREATED");
    const originalAdmin=await db.adminAccess.findUniqueOrThrow({where:{id:target.administratorId}});
    if((await bootstrapFirstAdministrator(db,target,"482731",true)).applied)throw Error("EXISTING_ADMIN_OVERWRITTEN");
    const unchanged=await db.adminAccess.findUniqueOrThrow({where:{id:target.administratorId}});
    if(originalAdmin.codeHash!==unchanged.codeHash)throw Error("ADMIN_HASH_CHANGED");
    await verifyDisposableIdentity(db,config,"seed-admin");
    await db.adminAccess.deleteMany({where:{id:target.administratorId}});
    const history = await db.$queryRawUnsafe<Array<{ count: bigint }>>('SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL');
    if (Number(history[0].count) !== 25) throw Error("MIGRATION_INVENTORY_MISMATCH");
    writeFileSync(path.join(evidence, "isolation.json"), JSON.stringify({ host: "127.0.0.1", version, emptyClusterVerified: true, restrictedRoleVerified: true, nativePermissionsRejected: 6, firstAdministratorCreateOnly: true, concurrentBootstrapSingleCreate: true, nonceBound: true, migrations: 25 }, null, 2));
  } finally { await db.$disconnect(); }
  if (process.argv.includes("--isolation-only")) return;
  const guard = pathToFileURL(path.join(root, "scripts/verification-network-guard.mjs")).href, context = pathToFileURL(path.join(root, "scripts/disposable-test-context.mjs")).href;
  const common = execFileSync("git",["rev-parse","--git-common-dir"],{cwd:root,encoding:"utf8",windowsHide:true}).trim();
  const original = path.dirname(path.resolve(root,common));
  const hashes: Record<string,string> = {};
  function snapshot(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (["node_modules", ".git", ".next", ".vercel", ".codex", ".aws"].includes(entry.name) || entry.name.startsWith(".env")) continue;
      const file = path.join(directory,entry.name);
      if (lstatSync(file).isSymbolicLink()) continue;
      if (entry.isDirectory()) snapshot(file);
      else if (entry.isFile()) hashes[path.relative(original,file).replaceAll("\\","/")] = fingerprintFile(file);
    }
  }
  snapshot(original);
  for (const file of ["prisma/dev.db", "public/app-release-signed.apk"]) if (!hashes[file]) throw Error("HISTORICAL_ARTIFACT_PROOF_MISSING");
  const preservationFile = path.join(evidence,"original-preservation.json");
  writeFileSync(preservationFile,JSON.stringify({original,hashes}));
  const env = { ...childEnv, RFL_DISPOSABLE_CONFIG_FILE: configFile, RFL_PRESERVATION_MANIFEST: preservationFile, NODE_OPTIONS: `--import=${guard} --import=${context}`, RFL_BANKING_SCREENSHOTS: path.join(evidence, "banking"), RFL_DASHBOARD_SCREENSHOTS: path.join(evidence, "dashboard"), RFL_SCREENSHOT_DIR: path.join(evidence, "notifications") };
  const files = readdirSync(path.join(root, "tests")).filter(file => file.endsWith(".test.mjs")).map(file => "tests/" + file);
  if (!process.argv.includes("--invariants-only")) {
  await stage("complete-regressions", ["--test", "--test-concurrency=1", "--test-reporter=tap", "--test-reporter-destination=stdout", "--test-reporter=./scripts/acceptance-reporter.mjs", "--test-reporter-destination=" + path.join(evidence,"regression-events.jsonl"), ...files], env);
  const regressionLog = readFileSync(path.join(evidence,"complete-regressions.log"),"utf8");
  for (const metric of ["fail", "cancelled", "skipped"]) if (!new RegExp("^# "+metric+" 0$","m").test(regressionLog)) throw Error("DATABASE_COVERAGE_INCOMPLETE");
  }
  await stage("postgres-invariants", ["--test", "--test-reporter=tap", "tests/fixtures/s7-p1-pg-invariants.mjs"], env);
}
void main().catch((error: unknown) => { const reason=error instanceof Error && /^(?:DISPOSABLE|RFL|FRESH_CLUSTER|POSTGRESQL|PORT|MISSING|RESTRICTED|MIGRATION|HISTORICAL|EMPTY|BOOTSTRAP|EXISTING|ADMIN|DATABASE|INVALID)_[A-Z_]+$/.test(error.message) ? error.message : "UNEXPECTED_FAILURE"; console.error(JSON.stringify({event:"disposable_acceptance_rejected",reason})); process.exitCode = 1; }).finally(() => {
  try {
    if (started) {
      if (!config) {
        // Startup failure is owned by this invocation's freshly initialized path.
        if (!ownedPid || Number(readFileSync(path.join(data,"postmaster.pid"),"utf8").split(/\r?\n/)[0]) !== ownedPid || path.resolve(data) !== path.resolve(os.tmpdir(), "rfl-b1-pg-" + nonce)) throw Error("CLEANUP_TARGET_REJECTED");
      } else verifyOwnershipFile(config);
      native("pg_ctl", ["-D", data, "-w", "-m", "fast", "stop"]); started = false;
    }
    const target = path.resolve(data), expected = path.resolve(os.tmpdir(), "rfl-b1-pg-" + nonce);
    if (target !== expected || !/^[a-f0-9]{32}$/.test(nonce) || path.dirname(target) !== path.resolve(os.tmpdir())) throw Error("CLEANUP_TARGET_REJECTED");
    if (existsSync(data)) rmSync(data, { recursive: true });
    for (const file of [configFile, markerFile, pwFile]) if (existsSync(file)) rmSync(file);
    cleanup = !existsSync(data) && !existsSync(configFile) && !existsSync(markerFile) && !existsSync(pwFile);
  } catch { console.error("Owned fixture cleanup requires review; no unrelated path was removed."); process.exitCode = 1; }
  if (existsSync(evidence)) writeFileSync(path.join(evidence, "summary.json"), JSON.stringify({ stages, cleanup }, null, 2));
  console.log("Sanitized acceptance evidence: " + evidence);
});

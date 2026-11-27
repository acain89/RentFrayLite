import { createHash } from "node:crypto";
import { closeSync, lstatSync, openSync, readSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { PrismaClient } from "@prisma/client";

export type DisposableScope = "regression" | "seed-admin";
export interface DisposableDatabaseConfig {
  isolationVerified: true; nonce: string; host: "127.0.0.1"; port: number;
  role: string; database: string; owner: string; password: string; data: string;
  project: string; systemId: string; startedAt: string; pid: number;
  connectionLimit: number; scopes: DisposableScope[];
}
export interface IdentityReader { $queryRawUnsafe<T = unknown>(query: string): Promise<T> }
interface Identity {
  username: string; database: string; directory: string; address: string; port: number;
  owner: string; systemid: string; nonce: string; started: string; superuser: boolean;
  createdb: boolean; createrole: boolean; replication: boolean; bypassrls: boolean;
  cancreate: boolean; ownerMember: boolean; connectionlimit: number;
}
const fail = (): never => { throw new Error("DISPOSABLE_DATABASE_PROOF_REJECTED"); };
const normalized = (value: string) => path.resolve(value).toLowerCase();
const fields = ["isolationVerified", "nonce", "host", "port", "role", "database", "owner", "password", "data", "project", "systemId", "startedAt", "pid", "connectionLimit", "scopes"].sort();
export function validateDisposableConfig(value: unknown): DisposableDatabaseConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail();
  const row = value as Record<string, unknown>;
  if (JSON.stringify(Object.keys(row).sort()) !== JSON.stringify(fields)) return fail();
  if (row.isolationVerified !== true || row.host !== "127.0.0.1" || typeof row.nonce !== "string" || !/^[a-f0-9]{32}$/.test(row.nonce)) return fail();
  if (typeof row.role !== "string" || typeof row.database !== "string" || typeof row.owner !== "string" || row.role !== "rfl_s5_" + row.nonce.slice(0, 12) || row.database !== row.role || row.owner !== "rfl_owner_" + row.nonce.slice(0, 12)) return fail();
  if (typeof row.password !== "string" || !/^[a-f0-9]{64}$/.test(row.password) || typeof row.port !== "number" || !Number.isInteger(row.port) || Number(row.port) <= 1024 || Number(row.port) >= 65536 || [5432, 5433].includes(Number(row.port))) return fail();
  if (typeof row.data !== "string" || normalized(row.data) !== normalized(path.join(os.tmpdir(), "rfl-b1-pg-" + row.nonce))) return fail();
  if (typeof row.project !== "string" || normalized(row.project) !== normalized(realpathSync(process.cwd()))) return fail();
  if (typeof row.systemId !== "string" || !/^\d{10,24}$/.test(row.systemId) || typeof row.startedAt !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(row.startedAt)) return fail();
  if (typeof row.pid !== "number" || !Number.isInteger(row.pid) || Number(row.pid) <= 0 || (typeof row.connectionLimit !== "number" || !Number.isInteger(row.connectionLimit) || row.connectionLimit < 1 || row.connectionLimit > 12) || !Array.isArray(row.scopes) || JSON.stringify(row.scopes) !== '["regression","seed-admin"]') return fail();
  return { isolationVerified: true, nonce: row.nonce, host: "127.0.0.1", port: row.port,
    role: row.role, database: row.database, owner: row.owner, password: row.password, data: row.data,
    project: row.project, systemId: row.systemId, startedAt: row.startedAt, pid: row.pid,
    connectionLimit: row.connectionLimit, scopes: ["regression", "seed-admin"] };
}
export function verifyOwnershipFile(config: DisposableDatabaseConfig): void {
  try {
    validateDisposableConfig(config);
    const directory = lstatSync(config.data), marker = lstatSync(config.data + ".owner.json");
    if (!directory.isDirectory() || directory.isSymbolicLink() || !marker.isFile() || marker.isSymbolicLink() || marker.size > 16384 || normalized(realpathSync(config.data)) !== normalized(config.data)) fail();
    const proof = JSON.parse(readFileSync(config.data + ".owner.json", "utf8"));
    const { password: omitted, ...publicConfig } = config;
    void omitted;
    if (JSON.stringify(proof) !== JSON.stringify(publicConfig)) fail();
    const pid = readFileSync(path.join(config.data, "postmaster.pid"), "utf8").split(/\r?\n/)[0];
    if (Number(pid) !== config.pid) fail();
  } catch { fail(); }
}
export function loadDisposableConfig(args: readonly string[] = process.argv): DisposableDatabaseConfig {
  try {
    const flags = args.filter(value => value.startsWith("--rfl-test-db-config="));
    if (flags.length !== 1 || !flags[0].slice(21)) fail();
    const file = flags[0].slice("--rfl-test-db-config=".length);
    if (!path.isAbsolute(file) || normalized(path.dirname(file)) !== normalized(os.tmpdir()) || !/^rfl-b1-pg-[a-f0-9]{32}\.fixture\.json$/.test(path.basename(file))) fail();
    const info = lstatSync(file);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 16384) fail();
    const config = validateDisposableConfig(JSON.parse(readFileSync(file, "utf8")));
    if (normalized(file) !== normalized(config.data + ".fixture.json")) fail();
    verifyOwnershipFile(config); return config;
  } catch { return fail(); }
}
export const DISPOSABLE_IDENTITY_SQL = `SELECT current_user AS username, current_database() AS database,
 current_setting('data_directory') AS directory, host(inet_server_addr()) AS address, inet_server_port() AS port,
 (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()) AS owner,
 (SELECT system_identifier::text FROM pg_control_system()) AS systemid,
 (SELECT nonce FROM rfl_fixture.identity WHERE singleton=true) AS nonce,
 to_char(pg_postmaster_start_time() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS started,
 rolsuper AS superuser, rolcreatedb AS createdb, rolcreaterole AS createrole, rolreplication AS replication,
 rolbypassrls AS bypassrls, rolconnlimit AS connectionlimit,
 has_schema_privilege(current_user,'public','CREATE') AS cancreate,
 pg_has_role(current_user,(SELECT datdba FROM pg_database WHERE datname=current_database()),'MEMBER') AS "ownerMember"
 FROM pg_roles WHERE rolname=current_user`;
export async function verifyDisposableIdentity(db: IdentityReader, config: DisposableDatabaseConfig, scope: DisposableScope = "regression"): Promise<void> {
  verifyOwnershipFile(config);
  if (!config.scopes.includes(scope)) fail();
  try {
    const rows = await db.$queryRawUnsafe<Identity[]>(DISPOSABLE_IDENTITY_SQL), row = rows[0];
    if (rows.length !== 1 || !row || row.username !== config.role || row.database !== config.database || row.address !== config.host || row.port !== config.port || normalized(row.directory) !== normalized(config.data) || row.owner !== config.owner || row.systemid !== config.systemId || row.nonce !== config.nonce || row.started !== config.startedAt || row.superuser !== false || row.createdb !== false || row.createrole !== false || row.replication !== false || row.bypassrls !== false || row.cancreate !== false || row.ownerMember !== false || row.connectionlimit !== 64) fail();
  } catch { fail(); }
}
export function disposableUrl(config: DisposableDatabaseConfig): string {
  verifyOwnershipFile(config);
  return `postgresql://${config.role}:${config.password}@127.0.0.1:${config.port}/${config.database}?connection_limit=${config.connectionLimit}&pool_timeout=15`;
}
export async function openDisposableDatabase(config: DisposableDatabaseConfig): Promise<PrismaClient> {
  const db = new PrismaClient({ datasources: { db: { url: disposableUrl(config) } } });
  try { await verifyDisposableIdentity(db, config); return db; }
  catch { await db.$disconnect(); throw new Error("DISPOSABLE_DATABASE_PROOF_REJECTED"); }
}

const fingerprintChunk=Buffer.alloc(1024*1024);
/** Synchronous bounded-memory fingerprint; never retains entire historical archives. */
export function fingerprintFile(file:string):string {const hash=createHash("sha256"),fd=openSync(file,"r");try{let bytes:number;while((bytes=readSync(fd,fingerprintChunk,0,fingerprintChunk.length,null))>0)hash.update(fingerprintChunk.subarray(0,bytes));return hash.digest("hex");}finally{closeSync(fd);}}

import bcrypt from "bcryptjs";
import { requireAdminCredential } from "../lib/adminCredential";
import { loadDisposableConfig, openDisposableDatabase, verifyDisposableIdentity, type DisposableDatabaseConfig } from "../lib/disposableDatabase";

export async function seedDisposableAdministrator(config: DisposableDatabaseConfig, value: unknown, apply = false) {
  const code = requireAdminCredential(value);
  const db = await openDisposableDatabase(config);
  try {
    const id = "rfl-fixture-admin-" + config.nonce;
    const codeHash = apply ? await bcrypt.hash(code, 12) : undefined;
    return await db.$transaction(async tx => {
      await verifyDisposableIdentity(tx, config, "seed-admin");
      if (!apply || !codeHash) return { applied: false, scope: "owned-fixture-administrator" };
      // Never delete another administrator, even inside the disposable database.
      await tx.adminAccess.deleteMany({ where: { id } });
      await tx.adminAccess.create({ data: { id, codeHash } });
      return { applied: true, scope: "owned-fixture-administrator" };
    });
  } finally { await db.$disconnect(); }
}
async function main() {
  const flags = process.argv.slice(2);
  if (flags.some(flag => flag !== "--apply" && flag !== "--scope=seed-admin" && !flag.startsWith("--rfl-test-db-config=")) || flags.filter(flag => flag === "--apply").length > 1 || flags.filter(flag => flag === "--scope=seed-admin").length !== 1) throw Error("SEED_SCOPE_REQUIRED");
  const config = loadDisposableConfig(flags);
  console.log(JSON.stringify(await seedDisposableAdministrator(config, process.env.SEED_ADMIN_CODE, flags.includes("--apply"))));
}
if (require.main === module) void main().catch(() => {
  console.error("Disposable administrator seed rejected; no unverified target is permitted.");
  process.exitCode = 1;
});

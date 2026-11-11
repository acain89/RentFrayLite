import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import test from "node:test";
import { postgres } from "./helpers/checkout-harness.mjs";

const root = path.resolve(import.meta.dirname, "..");
const migration = "20261025180000_independent_checkout_attempts";
test("attempt migration is forward-only, nullable and preserves every historical record", () => {
  const sql = readFileSync(path.join(root, "prisma/migrations", migration, "migration.sql"), "utf8");
  const statements = sql.replace(/--[^\n]*/g, "");
  assert.match(statements, /ADD COLUMN "checkoutAttemptId" TEXT;/);
  assert.match(statements, /CREATE UNIQUE INDEX "Payment_checkoutAttemptId_key"/);
  assert.match(statements, /DROP INDEX "Payment_active_recurring_obligation_unique";/);
  assert.doesNotMatch(statements, /\b(UPDATE|DELETE|TRUNCATE|CASCADE|DEFAULT|NOT NULL|DROP TABLE)\b/i);
  assert.match(readFileSync(path.join(root, "prisma/schema.prisma"), "utf8"), /checkoutAttemptId\s+String\?\s+@unique/);
  assert.doesNotMatch(readFileSync(path.join(root, "lib/checkoutRetry.ts"), "utf8"), /payment\.findMany|pg_advisory_xact_lock|referenceLabel.*ORDER BY/);
  assert.doesNotMatch(readFileSync(path.join(root, "lib/paymentStatus.ts"), "utf8"), /blocksDuplicatePayment/);
});

test("PostgreSQL migration history matches all source checksums and nullable attempt identity", { skip: !postgres }, async () => {
  const expected = readdirSync(path.join(root, "prisma/migrations"), { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort();
  const history = await postgres.$queryRawUnsafe('SELECT migration_name,checksum,finished_at,rolled_back_at FROM "_prisma_migrations" ORDER BY started_at,migration_name');
  assert.deepEqual(history.map(row => row.migration_name), expected);
  for (const row of history) {
    assert.ok(row.finished_at); assert.equal(row.rolled_back_at, null);
    assert.equal(row.checksum, createHash("sha256").update(readFileSync(path.join(root, "prisma/migrations", row.migration_name, "migration.sql"))).digest("hex"));
  }
  const [column] = await postgres.$queryRawUnsafe("SELECT data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='Payment' AND column_name='checkoutAttemptId'");
  assert.deepEqual(column, { data_type: "text", is_nullable: "YES", column_default: null });
});

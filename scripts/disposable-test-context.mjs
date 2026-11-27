// Only the independently provisioned fixture path is transported; the shared
// boundary still verifies filesystem ownership and native PostgreSQL identity.
const file = process.env.RFL_DISPOSABLE_CONFIG_FILE;
if (file && process.env.NODE_TEST_CONTEXT === "child-v8" && !process.argv.some(value => value.startsWith("--rfl-test-db-config="))) process.argv.push("--rfl-test-db-config=" + file);

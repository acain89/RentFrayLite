import { cp, lstat, mkdir, realpath, rm } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const standaloneRoot = path.join(projectRoot, ".next", "standalone");

async function checkReleaseInputs() {
  try {
    await lstat(path.join(projectRoot, "app", "sitemap.ts"));
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  throw new Error(
    "Refusing production build: preserved app/sitemap.ts conflicts with the approved sitemap. " +
    "Use a clean release checkout that excludes this historical artifact. " +
    "The original file will not be removed or modified."
  );
}

async function copyDirectory(source, destination, options = {}) {
  await mkdir(path.dirname(destination), { recursive: true });

  await cp(source, destination, {
    recursive: true,
    force: true,
    ...options,
  });
}

async function main() {
  const sourcePublic = path.join(projectRoot, "public");
  const outputPublic = path.join(standaloneRoot, "public");
  await mkdir(outputPublic, { recursive: true });
  const actualOutput = await realpath(outputPublic);
  const relativeOutput = path.relative(await realpath(standaloneRoot), actualOutput);
  if (actualOutput === await realpath(sourcePublic) || !relativeOutput || relativeOutput === ".." || relativeOutput.startsWith(`..${path.sep}`) || path.isAbsolute(relativeOutput)) {
    throw new Error("Public asset output must stay inside standalone output.");
  }
  // Remove only the generated copy, including output left by an older build.
  // The historical source APK is never changed. Reject external output links.
  await rm(path.join(actualOutput, "app-release-signed.apk"), { force: true });
  await copyDirectory(
    sourcePublic,
    actualOutput,
    { filter: source => path.resolve(source) !== path.join(sourcePublic, "app-release-signed.apk") }
  );

  await copyDirectory(
    path.join(projectRoot, ".next", "static"),
    path.join(standaloneRoot, ".next", "static")
  );

  console.log("Standalone assets copied successfully.");
}

async function run() {
  await checkReleaseInputs();
  if (!process.argv.includes("--check-release-inputs")) await main();
}

run().catch((error) => {
  console.error("Production build/asset preparation failed:", error);
  process.exitCode = 1;
});

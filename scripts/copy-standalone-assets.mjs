import { cp, mkdir } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const standaloneRoot = path.join(projectRoot, ".next", "standalone");

async function copyDirectory(source, destination) {
  await mkdir(path.dirname(destination), { recursive: true });

  await cp(source, destination, {
    recursive: true,
    force: true,
  });
}

async function main() {
  await copyDirectory(
    path.join(projectRoot, "public"),
    path.join(standaloneRoot, "public")
  );

  await copyDirectory(
    path.join(projectRoot, ".next", "static"),
    path.join(standaloneRoot, ".next", "static")
  );

  console.log("Standalone assets copied successfully.");
}

main().catch((error) => {
  console.error("Failed to copy standalone assets:", error);
  process.exitCode = 1;
});
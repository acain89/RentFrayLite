// scripts/copy-standalone-assets.js

const fs = require("fs");
const path = require("path");

const root = process.cwd();

function copyDir(from, to) {
  if (!fs.existsSync(from)) return;
  fs.rmSync(to, { recursive: true, force: true });
  fs.cpSync(from, to, { recursive: true });
}

copyDir(path.join(root, "public"), path.join(root, ".next", "standalone", "public"));
copyDir(
  path.join(root, ".next", "static"),
  path.join(root, ".next", "standalone", ".next", "static")
);

console.log("Standalone assets copied.");
#!/usr/bin/env node
/** Copy src/cli.js + src/codemod.js into vendor/ so `npx codemod publish` ships a self-contained package. */
const fs = require("fs");
const path = require("path");

const repoRoot = path.join(__dirname, "..", "..");
const vendorDir = path.join(__dirname, "vendor");
fs.mkdirSync(vendorDir, { recursive: true });

for (const f of ["cli.js", "codemod.js"]) {
  const from = path.join(repoRoot, "src", f);
  const to = path.join(vendorDir, f);
  fs.copyFileSync(from, to);
  process.stdout.write(`sync: ${from} → ${to}\n`);
}

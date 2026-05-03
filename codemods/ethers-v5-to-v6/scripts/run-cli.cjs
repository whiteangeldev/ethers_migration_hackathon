#!/usr/bin/env node
/**
 * Resolve cli.js from vendored copy (registry tarball) or monorepo ../../src (dev).
 */
const fs = require("fs");
const path = require("path");

const pkgRoot = path.join(__dirname, "..");
const vendored = path.join(pkgRoot, "vendor", "cli.js");
const devCli = path.join(pkgRoot, "..", "..", "src", "cli.js");
const cliEntry = fs.existsSync(vendored) ? vendored : devCli;

if (!fs.existsSync(cliEntry)) {
  console.error(
    "ethers codemod: cli not found. Run from repo root:\n  npm run registry:sync\n"
  );
  process.exit(1);
}

require(cliEntry);

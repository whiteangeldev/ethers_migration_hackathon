const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { transformSource } = require("../src/codemod");

const FIXTURES_DIR = path.join(__dirname, "fixtures");
const MANIFEST_PATH = path.join(__dirname, "fixtures-manifest.json");

function countByType(items, key) {
  return items.reduce((acc, item) => {
    acc[item[key]] = (acc[item[key]] || 0) + 1;
    return acc;
  }, {});
}

function testSafeRewrites() {
  const input = `
import { ethers } from "ethers";
const a = ethers.utils.parseEther("1");
const b = ethers.providers.JsonRpcProvider;
`;

  const result = transformSource(input, "safe.ts");

  assert.equal(result.changed, true, "Expected safe rewrites to change file");
  assert.match(result.output, /ethers\.parseEther\("1"\)/);
  assert.match(result.output, /ethers\.JsonRpcProvider/);
  assert.equal(result.risks.length, 0, "Safe rewrites should not raise risks");
}

function testRiskFlags() {
  const input = `
import { ethers, BigNumber } from "ethers";
const c = ethers.utils[someKey];
const d = ethers.providers[providerName];
const e = ethers.utils.customThing("x");
const f = BigNumber.from("1");
`;

  const result = transformSource(input, "risky.ts");

  assert.equal(result.changed, false, "Risk-only cases should not be rewritten");
  assert.ok(
    result.risks.some((risk) => risk.type === "dynamic-utils-access"),
    "Expected dynamic utils access risk"
  );
  assert.ok(
    result.risks.some((risk) => risk.type === "dynamic-providers-access"),
    "Expected dynamic providers access risk"
  );
  assert.ok(
    result.risks.some((risk) => risk.type === "unsafe-utils-member"),
    "Expected unsafe utils member risk"
  );
  assert.ok(
    result.risks.some((risk) => risk.type === "bignumber-usage"),
    "Expected BigNumber usage risk"
  );
}

function assertCountsEqual(actual, expected, label) {
  const keys = new Set([...Object.keys(actual || {}), ...Object.keys(expected || {})]);
  for (const k of keys) {
    assert.equal(
      actual[k] || 0,
      expected[k] || 0,
      `${label}: mismatch on "${k}" (got ${actual[k] || 0}, want ${expected[k] || 0})`
    );
  }
}

function testFixtureFile(fileName, spec) {
  const filePath = path.join(FIXTURES_DIR, fileName);
  const source = fs.readFileSync(filePath, "utf8");
  const result = transformSource(source, fileName);

  if (spec.changed === false) {
    assert.equal(result.changed, false, `${fileName}: expected no autofixes`);
  }

  const changeCounts = countByType(result.changes, "type");
  assertCountsEqual(changeCounts, spec.autofixTypes || {}, `${fileName} autofixTypes`);

  const riskCounts = countByType(result.risks, "type");
  assertCountsEqual(riskCounts, spec.riskTypeCounts || {}, `${fileName} riskTypeCounts`);

  for (const needle of spec.requiredInOutput || []) {
    assert.ok(
      result.output.includes(needle),
      `${fileName}: expected output to contain ${JSON.stringify(needle)}`
    );
  }
  for (const needle of spec.forbiddenInOutput || []) {
    assert.ok(
      !result.output.includes(needle),
      `${fileName}: expected output NOT to contain ${JSON.stringify(needle)}`
    );
  }
  for (const needle of spec.requiredStillContains || []) {
    assert.ok(
      result.output.includes(needle),
      `${fileName}: expected output to still contain ${JSON.stringify(needle)}`
    );
  }
}

function testFixturesFromManifest(manifest) {
  const entries = Object.entries(manifest.fixtures || {});
  assert.ok(entries.length > 0, "fixtures-manifest.json should list fixtures");

  for (const [fileName, spec] of entries) {
    testFixtureFile(fileName, spec);
  }
}

function run() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  testSafeRewrites();
  testRiskFlags();
  testFixturesFromManifest(manifest);
  const n = Object.keys(manifest.fixtures || {}).length;
  process.stdout.write(`All tests passed (${n} manifest fixture files).\n`);
}

run();

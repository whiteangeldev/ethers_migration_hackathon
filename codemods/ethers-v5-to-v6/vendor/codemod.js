const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const generate = require("@babel/generator").default;
const t = require("@babel/types");

/**
 * v5 → v6 migrations per https://docs.ethers.org/v6/migrating/
 * High-confidence only: explicit rename tables + namespace lifts.
 */

const PARSER_PLUGINS = [
  "jsx",
  "typescript",
  "classProperties",
  "dynamicImport",
  "optionalChaining",
  "nullishCoalescingOperator",
];

/** `ethers.utils.<v5>` → `ethers.<v6>` (name changes) */
const UTILS_MEMBER_V5_TO_V6 = {
  arrayify: "getBytes",
  hexDataSlice: "dataSlice",
  hexZeroPad: "zeroPadValue",
  hexValue: "toQuantity",
  formatBytes32String: "encodeBytes32String",
  parseBytes32String: "decodeBytes32String",
  solidityPack: "solidityPacked",
  solidityKeccak256: "solidityPackedKeccak256",
  soliditySha256: "solidityPackedSha256",
};

/** `ethers.utils.<name>` → `ethers.<name>` (same identifier at root in v6) */
const UTILS_MEMBER_SAME_AT_ROOT = new Set([
  "concat",
  "hexlify",
  "isAddress",
  "id",
  "keccak256",
  "parseEther",
  "parseUnits",
  "formatUnits",
  "sha256",
  "solidityPacked",
  "toUtf8Bytes",
]);

/** `ethers.providers.<v5>` → `ethers.<v6>` */
const PROVIDER_MEMBER_V5_TO_V6 = {
  Web3Provider: "BrowserProvider",
};

/** `ethers.providers.<name>` → `ethers.<name>` */
const PROVIDER_MEMBER_SAME_AT_ROOT = new Set([
  "JsonRpcProvider",
  "WebSocketProvider",
  "FallbackProvider",
  "AlchemyProvider",
  "InfuraProvider",
]);

/** `ethers.constants.<v5>` → `ethers.<v6>` */
const CONSTANTS_MEMBER_V5_TO_V6 = {
  AddressZero: "ZeroAddress",
  HashZero: "ZeroHash",
};

function parseCode(source, filePath) {
  return parser.parse(source, {
    sourceType: "unambiguous",
    sourceFilename: filePath,
    plugins: PARSER_PLUGINS,
  });
}

function snippetFromLocation(source, loc, radius = 2) {
  if (!loc || !loc.start || !loc.end) {
    return "";
  }
  const lines = source.split("\n");
  const start = Math.max(1, loc.start.line - radius);
  const end = Math.min(lines.length, loc.end.line + radius);
  const snippetLines = [];
  for (let i = start; i <= end; i += 1) {
    snippetLines.push(`${i}: ${lines[i - 1]}`);
  }
  return snippetLines.join("\n");
}

function createRisk(type, message, path, source) {
  return {
    type,
    message,
    line: path.node.loc ? path.node.loc.start.line : null,
    snippet: snippetFromLocation(source, path.node.loc),
  };
}

function isEthersChain(node, chain) {
  let current = node;
  for (let i = chain.length - 1; i >= 0; i -= 1) {
    const expected = chain[i];
    if (!t.isMemberExpression(current) || current.computed) {
      return false;
    }
    if (!t.isIdentifier(current.property, { name: expected })) {
      return false;
    }
    if (i === 0) {
      return t.isIdentifier(current.object, { name: "ethers" });
    }
    current = current.object;
  }
  return false;
}

function resolveUtilsV6Member(v5Member) {
  if (Object.prototype.hasOwnProperty.call(UTILS_MEMBER_V5_TO_V6, v5Member)) {
    return UTILS_MEMBER_V5_TO_V6[v5Member];
  }
  if (UTILS_MEMBER_SAME_AT_ROOT.has(v5Member)) {
    return v5Member;
  }
  return null;
}

function resolveProviderV6Member(v5Member) {
  if (Object.prototype.hasOwnProperty.call(PROVIDER_MEMBER_V5_TO_V6, v5Member)) {
    return PROVIDER_MEMBER_V5_TO_V6[v5Member];
  }
  if (PROVIDER_MEMBER_SAME_AT_ROOT.has(v5Member)) {
    return v5Member;
  }
  return null;
}

/** Flatten `a.b.c` TSQualifiedName → `["a","b","c"]`. */
function tsQualifiedNameParts(node) {
  const parts = [];
  let current = node;
  while (t.isTSQualifiedName(current)) {
    parts.unshift(current.right.name);
    current = current.left;
  }
  if (t.isIdentifier(current)) {
    parts.unshift(current.name);
  }
  return parts;
}

function transformSource(source, filePath) {
  const ast = parseCode(source, filePath);
  const changes = [];
  const risks = [];

  traverse(ast, {
    TSQualifiedName(path) {
      const parts = tsQualifiedNameParts(path.node);
      if (parts.length !== 3 || parts[0] !== "ethers") {
        return;
      }
      const [, bucket, member] = parts;
      if (bucket === "utils") {
        const v6 = resolveUtilsV6Member(member);
        if (v6) {
          path.replaceWith(t.tsQualifiedName(t.identifier("ethers"), t.identifier(v6)));
          changes.push({
            type: member === v6 ? "utils-to-root" : "utils-rename-v6",
            from: `ethers.utils.${member}`,
            to: `ethers.${v6}`,
            line: path.node.loc ? path.node.loc.start.line : null,
          });
        } else {
          risks.push(
            createRisk(
              "unsafe-utils-member",
              `Member ethers.utils.${member} (type) is not mapped for safe v6 migration.`,
              path,
              source
            )
          );
        }
        return;
      }
      if (bucket === "providers") {
        const v6 = resolveProviderV6Member(member);
        if (v6) {
          path.replaceWith(t.tsQualifiedName(t.identifier("ethers"), t.identifier(v6)));
          changes.push({
            type: member === v6 ? "providers-to-root" : "providers-rename-v6",
            from: `ethers.providers.${member}`,
            to: `ethers.${v6}`,
            line: path.node.loc ? path.node.loc.start.line : null,
          });
        } else {
          risks.push(
            createRisk(
              "unsafe-providers-member",
              `Member ethers.providers.${member} (type) is not mapped for safe v6 migration.`,
              path,
              source
            )
          );
        }
        return;
      }
      if (bucket === "constants") {
        const v6 = CONSTANTS_MEMBER_V5_TO_V6[member];
        if (v6) {
          path.replaceWith(t.tsQualifiedName(t.identifier("ethers"), t.identifier(v6)));
          changes.push({
            type: "constants-to-v6",
            from: `ethers.constants.${member}`,
            to: `ethers.${v6}`,
            line: path.node.loc ? path.node.loc.start.line : null,
          });
        } else {
          risks.push(
            createRisk(
              "unsafe-constants-member",
              `Member ethers.constants.${member} (type) is not mapped for safe v6 migration.`,
              path,
              source
            )
          );
        }
      }
    },
    MemberExpression(path) {
      if (path.node.computed) {
        if (t.isStringLiteral(path.node.property)) {
          const key = path.node.property.value;
          const obj = path.node.object;
          if (isEthersChain(obj, ["utils"])) {
            const v6 = resolveUtilsV6Member(key);
            if (v6) {
              path.replaceWith(t.memberExpression(t.identifier("ethers"), t.identifier(v6)));
              changes.push({
                type: key === v6 ? "utils-to-root" : "utils-rename-v6",
                from: `ethers.utils["${key}"]`,
                to: `ethers.${v6}`,
                line: path.node.loc ? path.node.loc.start.line : null,
              });
              return;
            }
            risks.push(
              createRisk(
                "unsafe-utils-literal-key",
                `ethers.utils["${key}"] has no safe v6 mapping.`,
                path,
                source
              )
            );
            return;
          }
          if (isEthersChain(obj, ["providers"])) {
            const v6 = resolveProviderV6Member(key);
            if (v6) {
              path.replaceWith(t.memberExpression(t.identifier("ethers"), t.identifier(v6)));
              changes.push({
                type: key === v6 ? "providers-to-root" : "providers-rename-v6",
                from: `ethers.providers["${key}"]`,
                to: `ethers.${v6}`,
                line: path.node.loc ? path.node.loc.start.line : null,
              });
              return;
            }
            risks.push(
              createRisk(
                "unsafe-providers-literal-key",
                `ethers.providers["${key}"] has no safe v6 mapping.`,
                path,
                source
              )
            );
            return;
          }
          if (isEthersChain(obj, ["constants"])) {
            const v6 = CONSTANTS_MEMBER_V5_TO_V6[key];
            if (v6) {
              path.replaceWith(t.memberExpression(t.identifier("ethers"), t.identifier(v6)));
              changes.push({
                type: "constants-to-v6",
                from: `ethers.constants["${key}"]`,
                to: `ethers.${v6}`,
                line: path.node.loc ? path.node.loc.start.line : null,
              });
              return;
            }
            risks.push(
              createRisk(
                "unsafe-constants-literal-key",
                `ethers.constants["${key}"] has no safe v6 mapping.`,
                path,
                source
              )
            );
            return;
          }
        }
        if (
          t.isMemberExpression(path.node.object) &&
          t.isIdentifier(path.node.object.object, { name: "ethers" }) &&
          t.isIdentifier(path.node.object.property, { name: "utils" })
        ) {
          risks.push(
            createRisk(
              "dynamic-utils-access",
              "Dynamic access on ethers.utils cannot be auto-fixed safely.",
              path,
              source
            )
          );
        }
        if (
          t.isMemberExpression(path.node.object) &&
          t.isIdentifier(path.node.object.object, { name: "ethers" }) &&
          t.isIdentifier(path.node.object.property, { name: "providers" })
        ) {
          risks.push(
            createRisk(
              "dynamic-providers-access",
              "Dynamic access on ethers.providers cannot be auto-fixed safely.",
              path,
              source
            )
          );
        }
        if (
          t.isMemberExpression(path.node.object) &&
          t.isIdentifier(path.node.object.object, { name: "ethers" }) &&
          t.isIdentifier(path.node.object.property, { name: "constants" })
        ) {
          risks.push(
            createRisk(
              "dynamic-constants-access",
              "Dynamic access on ethers.constants cannot be auto-fixed safely.",
              path,
              source
            )
          );
        }
        return;
      }

      if (isEthersChain(path.node, ["utils"])) {
        return;
      }
      if (isEthersChain(path.node, ["providers"])) {
        return;
      }
      if (isEthersChain(path.node, ["constants"])) {
        return;
      }

      if (isEthersChain(path.node.object, ["utils"])) {
        const member = path.node.property.name;
        const v6 = resolveUtilsV6Member(member);
        if (v6) {
          path.replaceWith(t.memberExpression(t.identifier("ethers"), t.identifier(v6)));
          changes.push({
            type: member === v6 ? "utils-to-root" : "utils-rename-v6",
            from: `ethers.utils.${member}`,
            to: `ethers.${v6}`,
            line: path.node.loc ? path.node.loc.start.line : null,
          });
          return;
        }
        risks.push(
          createRisk(
            "unsafe-utils-member",
            `Member ethers.utils.${member} is not mapped for safe v6 migration.`,
            path,
            source
          )
        );
        return;
      }

      if (isEthersChain(path.node.object, ["providers"])) {
        const member = path.node.property.name;
        const v6 = resolveProviderV6Member(member);
        if (v6) {
          path.replaceWith(t.memberExpression(t.identifier("ethers"), t.identifier(v6)));
          changes.push({
            type: member === v6 ? "providers-to-root" : "providers-rename-v6",
            from: `ethers.providers.${member}`,
            to: `ethers.${v6}`,
            line: path.node.loc ? path.node.loc.start.line : null,
          });
          return;
        }
        risks.push(
          createRisk(
            "unsafe-providers-member",
            `Member ethers.providers.${member} is not mapped for safe v6 migration.`,
            path,
            source
          )
        );
        return;
      }

      if (isEthersChain(path.node.object, ["constants"])) {
        const member = path.node.property.name;
        const v6 = CONSTANTS_MEMBER_V5_TO_V6[member];
        if (v6) {
          path.replaceWith(t.memberExpression(t.identifier("ethers"), t.identifier(v6)));
          changes.push({
            type: "constants-to-v6",
            from: `ethers.constants.${member}`,
            to: `ethers.${v6}`,
            line: path.node.loc ? path.node.loc.start.line : null,
          });
          return;
        }
        risks.push(
          createRisk(
            "unsafe-constants-member",
            `Member ethers.constants.${member} is not mapped for safe v6 migration.`,
            path,
            source
          )
        );
      }
    },
    Identifier(path) {
      if (path.node.name !== "BigNumber") {
        return;
      }
      if (
        t.isImportSpecifier(path.parent) ||
        t.isImportDefaultSpecifier(path.parent) ||
        t.isImportNamespaceSpecifier(path.parent)
      ) {
        return;
      }
      risks.push(
        createRisk(
          "bignumber-usage",
          "BigNumber usage requires manual or AI-assisted migration review.",
          path,
          source
        )
      );
    },
  });

  const output = generate(ast, { retainLines: true }, source).code;

  return {
    changed: changes.length > 0,
    output,
    changes,
    risks,
  };
}

module.exports = {
  transformSource,
  UTILS_MEMBER_V5_TO_V6,
  CONSTANTS_MEMBER_V5_TO_V6,
};

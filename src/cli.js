#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const fg = require("fast-glob");
const { transformSource } = require("./codemod");

function parseArgs(argv) {
  const args = {
    target: ".",
    write: false,
    outDir: "migration-report",
    emitTo: null,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === "--write") {
      args.write = true;
    } else if (item === "--target") {
      args.target = argv[i + 1];
      i += 1;
    } else if (item === "--out-dir") {
      args.outDir = argv[i + 1];
      i += 1;
    } else if (item === "--emit-to") {
      args.emitTo = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function collectFiles(targetDir) {
  return fg.sync(["**/*.{js,jsx,ts,tsx,mjs,cjs}"], {
    cwd: targetDir,
    absolute: true,
    ignore: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
    ],
  });
}

function createSummary(run) {
  return {
    scannedFiles: run.filesScanned,
    changedFiles: run.filesChanged,
    skippedFiles: run.filesSkipped,
    totalAutofixes: run.autofixes.length,
    totalRisks: run.risks.length,
    riskTypes: run.risks.reduce((acc, risk) => {
      acc[risk.type] = (acc[risk.type] || 0) + 1;
      return acc;
    }, {}),
  };
}

function writeMarkdownReport(reportPath, run, summary) {
  const lines = [];
  lines.push("# ethers Migration Report");
  lines.push("");
  lines.push("## Summary");
  lines.push(`- Scanned files: ${summary.scannedFiles}`);
  lines.push(`- Changed files: ${summary.changedFiles}`);
  lines.push(`- Skipped files: ${summary.skippedFiles}`);
  lines.push(`- Auto-fixes: ${summary.totalAutofixes}`);
  lines.push(`- Risk flags: ${summary.totalRisks}`);
  lines.push("");
  lines.push("## Risk Type Breakdown");
  if (Object.keys(summary.riskTypes).length === 0) {
    lines.push("- None");
  } else {
    for (const [riskType, count] of Object.entries(summary.riskTypes)) {
      lines.push(`- ${riskType}: ${count}`);
    }
  }
  lines.push("");
  lines.push("## Changed Files");
  if (run.changedFileDetails.length === 0) {
    lines.push("- None");
  } else {
    for (const file of run.changedFileDetails) {
      lines.push(`- ${file.filePath} (${file.changeCount} rewrites)`);
    }
  }
  lines.push("");
  lines.push("## AI Queue");
  lines.push(
    "Flagged snippets are in `ai-queue.jsonl` for targeted follow-up.",
  );
  lines.push("");
  fs.writeFileSync(reportPath, `${lines.join("\n")}\n`, "utf8");
}

function writeAiQueue(aiQueuePath, run) {
  const lines = run.risks.map((risk) =>
    JSON.stringify({
      filePath: risk.filePath,
      riskType: risk.type,
      message: risk.message,
      line: risk.line,
      snippet: risk.snippet,
      instruction:
        "Apply the minimum safe change needed for ethers v5→v6 API migration. Do not refactor unrelated code.",
    }),
  );
  fs.writeFileSync(aiQueuePath, lines.join("\n"), "utf8");
}

function main() {
  const args = parseArgs(process.argv);
  const targetDir = path.resolve(process.cwd(), args.target);
  const outDir = path.resolve(process.cwd(), args.outDir);
  const emitRoot = args.emitTo
    ? path.resolve(process.cwd(), args.emitTo)
    : null;
  ensureDir(outDir);
  if (emitRoot) {
    ensureDir(emitRoot);
  }

  const run = {
    filesScanned: 0,
    filesChanged: 0,
    filesSkipped: 0,
    autofixes: [],
    risks: [],
    changedFileDetails: [],
  };

  const files = collectFiles(targetDir);

  for (const filePath of files) {
    run.filesScanned += 1;
    const source = fs.readFileSync(filePath, "utf8");
    const result = transformSource(source, filePath);

    const relativeFromTarget = path.relative(targetDir, filePath);
    const emitPath = emitRoot ? path.join(emitRoot, relativeFromTarget) : null;
    /** Paths in reports / ai-queue point at emitted tree when mirroring, else source files. */
    const reportFilePath = emitPath || filePath;

    if (emitRoot) {
      ensureDir(path.dirname(emitPath));
      fs.writeFileSync(emitPath, result.output, "utf8");
    }

    if (result.changed) {
      run.filesChanged += 1;
      run.changedFileDetails.push({
        filePath: reportFilePath,
        changeCount: result.changes.length,
      });
      run.autofixes.push(
        ...result.changes.map((change) => ({
          filePath: reportFilePath,
          ...change,
        })),
      );
      if (args.write) {
        fs.writeFileSync(filePath, result.output, "utf8");
      }
    } else {
      run.filesSkipped += 1;
    }

    run.risks.push(
      ...result.risks.map((risk) => ({
        filePath: reportFilePath,
        ...risk,
      })),
    );
  }

  const summary = createSummary(run);
  const jsonPath = path.join(outDir, "report.json");
  const mdPath = path.join(outDir, "report.md");
  const aiQueuePath = path.join(outDir, "ai-queue.jsonl");
  fs.writeFileSync(jsonPath, JSON.stringify({ summary, run }, null, 2), "utf8");
  writeMarkdownReport(mdPath, run, summary);
  writeAiQueue(aiQueuePath, run);

  process.stdout.write(
    `Scanned ${summary.scannedFiles} files, changed ${summary.changedFiles}, flagged ${summary.totalRisks} risks.\n`,
  );
  process.stdout.write(`Reports: ${mdPath}, ${jsonPath}, ${aiQueuePath}\n`);
  if (emitRoot) {
    process.stdout.write(`Emitted transformed sources to: ${emitRoot}\n`);
  }
}

main();

#!/usr/bin/env node
/**
 * One-shot hackathon pipeline: deterministic codemod → reports → optional AI queue fixes.
 * Always writes `pipeline-summary.md` + `pipeline-summary.json` in `--out-dir` (autofix + AI in one place).
 */

const fs = require("fs");
const { spawnSync } = require("child_process");
const path = require("path");
const { loadOpenAiEnv, getOpenAiApiKey } = require("./openai-env");

function parseArgs(argv) {
  const args = {
    target: ".",
    outDir: "migration-report",
    emitTo: null,
    dry: false,
    noAi: false,
    aiOutReport: null,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--target") {
      args.target = argv[i + 1];
      i += 1;
    } else if (a === "--out-dir") {
      args.outDir = argv[i + 1];
      i += 1;
    } else if (a === "--emit-to") {
      args.emitTo = argv[i + 1];
      i += 1;
    } else if (a === "--dry") {
      args.dry = true;
    } else if (a === "--no-ai") {
      args.noAi = true;
    } else if (a === "--ai-out-report") {
      args.aiOutReport = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

function runNode(scriptRelative, extraArgs, inherit = true) {
  const script = path.join(__dirname, scriptRelative);
  const node = process.execPath;
  const r = spawnSync(node, [script, ...extraArgs], {
    stdio: inherit ? "inherit" : "pipe",
    cwd: process.cwd(),
    env: process.env,
  });
  if (r.error) {
    throw r.error;
  }
  return r.status ?? 1;
}

function readCodemodSummary(reportJsonPath) {
  try {
    const data = JSON.parse(fs.readFileSync(reportJsonPath, "utf8"));
    const s = data.summary || {};
    return {
      scannedFiles: s.scannedFiles,
      changedFiles: s.changedFiles,
      skippedFiles: s.skippedFiles,
      totalAutofixes: s.totalAutofixes,
      totalRisks: s.totalRisks,
      riskTypes: s.riskTypes || {},
    };
  } catch {
    return null;
  }
}

function aggregateAiReport(aiReportPath) {
  if (!fs.existsSync(aiReportPath)) {
    return null;
  }
  const lines = fs.readFileSync(aiReportPath, "utf8").trim().split("\n").filter(Boolean);
  let processed = 0;
  let modelSkips = 0;
  let blocked = 0;
  let diskWrites = 0;
  let validatedDry = 0;
  for (const line of lines) {
    let o;
    try {
      o = JSON.parse(line);
    } catch {
      blocked += 1;
      processed += 1;
      continue;
    }
    processed += 1;
    if (!o.ok) {
      blocked += 1;
      continue;
    }
    if (o.applied === true) {
      diskWrites += 1;
    } else if (o.dryRun === true) {
      validatedDry += 1;
    } else if (o.reason) {
      modelSkips += 1;
    }
  }
  return { processed, modelSkips, blocked, diskWrites, validatedDry };
}

function writePipelineSummary(outDirAbs, { dry, aiSkippedReason, aiReportPath, aiRan }) {
  fs.mkdirSync(outDirAbs, { recursive: true });
  const reportJsonPath = path.join(outDirAbs, "report.json");
  const reportMdPath = path.join(outDirAbs, "report.md");
  const queuePath = path.join(outDirAbs, "ai-queue.jsonl");
  const codemod = readCodemodSummary(reportJsonPath);

  let aiSection = null;
  if (aiRan && aiReportPath) {
    aiSection = {
      ran: true,
      writeMode: !dry,
      reportPath: aiReportPath,
      ...aggregateAiReport(aiReportPath),
    };
  } else {
    aiSection = {
      ran: false,
      reason: aiSkippedReason || "unknown",
    };
  }

  const doc = {
    generatedAt: new Date().toISOString(),
    dryRun: dry,
    autofix: codemod
      ? {
          ...codemod,
          reportMarkdown: reportMdPath,
          reportJson: reportJsonPath,
          aiQueue: queuePath,
        }
      : { error: "report.json missing or unreadable" },
    ai: aiSection,
    artifacts: {
      unifiedMarkdown: path.join(outDirAbs, "pipeline-summary.md"),
      autofixDetail: reportMdPath,
      aiLineItems: aiSection.ran ? aiReportPath : null,
    },
  };

  fs.writeFileSync(path.join(outDirAbs, "pipeline-summary.json"), `${JSON.stringify(doc, null, 2)}\n`, "utf8");

  const lines = [];
  lines.push("# Pipeline summary (autofix + AI)");
  lines.push("");
  lines.push(`Generated: ${doc.generatedAt}`);
  lines.push(`Mode: **${dry ? "dry-run (no source writes from codemod)" : "write"}** — AI ${dry ? "dry" : "apply"} matches \`--write\` on the full migrate command.`);
  lines.push("");
  lines.push("## Step 1 — Deterministic codemod (autofix)");
  lines.push("");
  if (codemod) {
    lines.push("| Metric | Value |");
    lines.push("| --- | --- |");
    lines.push(`| Files scanned | ${codemod.scannedFiles} |`);
    lines.push(`| Files changed | ${codemod.changedFiles} |`);
    lines.push(`| Auto-fixes (AST edits) | ${codemod.totalAutofixes} |`);
    lines.push(`| Risk flags (→ AI queue) | ${codemod.totalRisks} |`);
    lines.push("");
    lines.push("**Detail:** `" + path.basename(reportMdPath) + "`, `" + path.basename(reportJsonPath) + "`");
    lines.push("");
    lines.push("## Step 2 — AI queue (gated search/replace)");
    lines.push("");
    if (aiSection.ran) {
      lines.push("| Metric | Value |");
      lines.push("| --- | --- |");
      lines.push(`| Queue rows processed | ${aiSection.processed} |`);
      lines.push(`| Validated edits (would write / wrote) | ${(aiSection.diskWrites || 0) + (aiSection.validatedDry || 0)} |`);
      lines.push(`| Disk writes | ${aiSection.diskWrites} |`);
      lines.push(`| Model skip | ${aiSection.modelSkips} |`);
      lines.push(`| Blocked / errors | ${aiSection.blocked} |`);
      lines.push("");
      lines.push("**Detail:** `" + path.basename(aiReportPath) + "`");
    } else {
      lines.push(`*Not run — ${aiSection.reason}*`);
    }
  } else {
    lines.push("*No codemod report found (step 1 may have failed before writing).*");
  }
  lines.push("");
  lines.push("## Quick links");
  lines.push("");
  lines.push(`- **This file** — single place for both steps`);
  lines.push(`- \`${path.basename(reportMdPath)}\` — autofix narrative + file list`);
  lines.push(`- \`${path.basename(queuePath)}\` — input queue for AI`);
  if (aiSection.ran && aiReportPath) {
    lines.push(`- \`${path.basename(aiReportPath)}\` — one JSON per queue row`);
  }
  lines.push("");

  fs.writeFileSync(path.join(outDirAbs, "pipeline-summary.md"), `${lines.join("\n")}\n`, "utf8");
}

function printUnifiedFooter(outDirAbs) {
  const summaryMd = path.join(outDirAbs, "pipeline-summary.md");
  process.stdout.write(
    `\n--- Unified result (autofix + AI): ${summaryMd} ---\n` +
      `Open that file for both steps in one view; JSON mirror: pipeline-summary.json\n`
  );
}

function main() {
  loadOpenAiEnv();
  const args = parseArgs(process.argv);
  const root = process.cwd();
  const outDirAbs = path.resolve(root, args.outDir);
  /** AI step: honor --dry (no writes) vs apply. */
  const aiWriteFlag = args.dry ? [] : ["--write"];

  let emitToResolved = args.emitTo ? path.resolve(root, args.emitTo) : null;
  if (args.dry && emitToResolved) {
    process.stderr.write("[migrate] --dry: ignoring --emit-to (no mirror writes).\n");
    emitToResolved = null;
  }
  /**
   * With --emit-to, the codemod always writes the transformed tree to the mirror only.
   * Do not pass --write to cli.js, or --target files would be overwritten in place.
   */
  const codemodWriteInPlace = !args.dry && !emitToResolved;
  const codemodWriteFlag = codemodWriteInPlace ? ["--write"] : [];
  if (emitToResolved && !args.dry) {
    process.stderr.write(
      "[migrate] --emit-to: autofix output goes to the mirror only; --target is left unchanged.\n"
    );
  }

  const aiReportPath = args.aiOutReport
    ? path.resolve(root, args.aiOutReport)
    : path.join(outDirAbs, "ai-fix-report.jsonl");

  process.stdout.write("\n== Step 1: deterministic codemod (Babel AST) ==\n");
  const codemodArgs = [
    "--target",
    path.resolve(root, args.target),
    "--out-dir",
    outDirAbs,
    ...codemodWriteFlag,
  ];
  if (emitToResolved) {
    codemodArgs.push("--emit-to", emitToResolved);
  }
  const c1 = runNode("cli.js", codemodArgs);
  if (c1 !== 0) {
    process.stderr.write("Codemod failed; aborting pipeline.\n");
    writePipelineSummary(outDirAbs, {
      dry: args.dry,
      aiSkippedReason: "codemod-failed",
      aiReportPath,
      aiRan: false,
    });
    printUnifiedFooter(outDirAbs);
    process.exit(c1);
  }

  if (args.noAi) {
    process.stdout.write("\n== Step 2: AI pass skipped (--no-ai) ==\n");
    writePipelineSummary(outDirAbs, {
      dry: args.dry,
      aiSkippedReason: "--no-ai",
      aiReportPath,
      aiRan: false,
    });
    printUnifiedFooter(outDirAbs);
    process.exit(0);
  }

  const queuePath = path.join(outDirAbs, "ai-queue.jsonl");
  if (!fs.existsSync(queuePath)) {
    process.stderr.write(`No AI queue at ${queuePath}; skipping AI.\n`);
    writePipelineSummary(outDirAbs, {
      dry: args.dry,
      aiSkippedReason: "ai-queue-missing",
      aiReportPath,
      aiRan: false,
    });
    printUnifiedFooter(outDirAbs);
    process.exit(0);
  }
  const queueBody = fs.readFileSync(queuePath, "utf8").trim();
  if (!queueBody) {
    process.stdout.write("\n== Step 2: AI queue empty; nothing to do ==\n");
    writePipelineSummary(outDirAbs, {
      dry: args.dry,
      aiSkippedReason: "ai-queue-empty",
      aiReportPath,
      aiRan: false,
    });
    printUnifiedFooter(outDirAbs);
    process.exit(0);
  }

  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    process.stdout.write(
      "\n== Step 2: AI pass skipped (no OPENAI_API_KEY). Set key in .env or run with --no-ai ==\n"
    );
    writePipelineSummary(outDirAbs, {
      dry: args.dry,
      aiSkippedReason: "no-openai-key",
      aiReportPath,
      aiRan: false,
    });
    printUnifiedFooter(outDirAbs);
    process.exit(0);
  }

  process.stdout.write("\n== Step 2: AI queue (OpenAI, gated apply) ==\n");
  const aiArgs = ["--queue", queuePath, "--out-report", aiReportPath, ...aiWriteFlag];
  const c2 = runNode("ai-fix-queue.js", aiArgs);
  writePipelineSummary(outDirAbs, {
    dry: args.dry,
    aiSkippedReason: null,
    aiReportPath,
    aiRan: true,
  });
  printUnifiedFooter(outDirAbs);
  process.exit(c2);
}

main();

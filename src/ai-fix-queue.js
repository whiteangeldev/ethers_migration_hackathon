#!/usr/bin/env node
/**
 * Second pass: apply minimal fixes from migration-report/ai-queue.jsonl using OpenAI.
 * Safety gates (hackathon: accuracy, reliability):
 * - Model must return JSON: { skip, reason } OR { searchText, replaceText }.
 * - searchText must occur exactly once in the current file.
 * - After replace, file must parse with @babel/parser (typescript + jsx).
 * - Dry-run by default; use --write to persist.
 */

const fs = require("fs");
const path = require("path");
const parser = require("@babel/parser");
const { loadOpenAiEnv, getOpenAiApiKey, ENV_PATH } = require("./openai-env");

const PARSER_PLUGINS = [
  "jsx",
  "typescript",
  "classProperties",
  "dynamicImport",
  "optionalChaining",
  "nullishCoalescingOperator",
];

function parseArgs(argv) {
  const args = {
    queue: path.join(process.cwd(), "migration-report", "ai-queue.jsonl"),
    outReport: path.join(process.cwd(), "migration-report", "ai-fix-report.jsonl"),
    write: false,
    max: Infinity,
    delayMs: 400,
    allowNoKey: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--write") args.write = true;
    if (a === "--allow-no-key") args.allowNoKey = true;
    else if (a === "--queue") {
      args.queue = path.resolve(process.cwd(), argv[i + 1]);
      i += 1;
    } else if (a === "--out-report") {
      args.outReport = path.resolve(process.cwd(), argv[i + 1]);
      i += 1;
    } else if (a === "--max") {
      args.max = Number(argv[i + 1]) || 0;
      i += 1;
    } else if (a === "--delay-ms") {
      args.delayMs = Number(argv[i + 1]) || 0;
      i += 1;
    }
  }
  return args;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseFileOrThrow(source, filePath) {
  parser.parse(source, {
    sourceType: "unambiguous",
    sourceFilename: filePath,
    plugins: PARSER_PLUGINS,
  });
}

function extractJsonObject(text) {
  const t = text.trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object in model response");
  }
  return JSON.parse(t.slice(start, end + 1));
}

async function callOpenAi(userPrompt) {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY in environment or .env");
  }
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You help migrate JavaScript/TypeScript from ethers v5 to v6. " +
            "Follow https://docs.ethers.org/v6/migrating/ . " +
            "Reply with a single JSON object only. No markdown fences.",
        },
        { role: "user", content: userPrompt },
      ],
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI HTTP ${res.status}: ${errText.slice(0, 500)}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Empty OpenAI response");
  }
  return extractJsonObject(content);
}

function buildPrompt(row, fileSource) {
  const maxFile = 14_000;
  const truncated =
    fileSource.length > maxFile ? `${fileSource.slice(0, maxFile)}\n\n/* ... truncated ... */\n` : fileSource;
  return `Fix ONE flagged item for an ethers v5 → v6 migration.

riskType: ${row.riskType}
message: ${row.message}
filePath: ${row.filePath}
line: ${row.line ?? "unknown"}

snippet:
${row.snippet}

instruction:
${row.instruction}

Full file:
${truncated}

Return JSON in exactly one of these shapes:
1) { "skip": true, "reason": "short reason" }
2) { "searchText": "...", "replaceText": "..." }

Hard rules:
- searchText MUST be copied verbatim from the full file and MUST occur exactly once.
- replaceText replaces only that single occurrence (plain substring replace).
- Smallest possible edit for this risk only.
- For BigNumber: prefer bigint (e.g. 0n) or native operators only when clearly equivalent; otherwise skip.
- For unknown members like customThing: skip unless you can replace with a real documented v6 equivalent.
- For defaultAbiCoder: v6 uses AbiCoder.defaultAbiCoder() — add import { AbiCoder } from "ethers" only if needed and keep edits minimal.`;
}

async function main() {
  const args = parseArgs(process.argv);
  loadOpenAiEnv();
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    const exists = fs.existsSync(ENV_PATH);
    process.stderr.write(
      "No OpenAI API key found.\n" +
        `- Add a line to ${exists ? ".env" : ".env (create from .env.example)"}: OPENAI_API_KEY=sk-...\n` +
        "- Or use OPENAI_KEY=sk-... (alias).\n" +
        "- No spaces around `=`. Use one line per variable; quotes optional.\n" +
        `- File checked: ${ENV_PATH}\n`
    );
    process.exit(args.allowNoKey ? 0 : 1);
  }

  if (!fs.existsSync(args.queue)) {
    process.stderr.write(`Queue file not found: ${args.queue}\n`);
    process.exit(1);
  }

  const lines = fs
    .readFileSync(args.queue, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const reportLines = [];
  let blocked = 0;

  const queueRows = [];
  for (const line of lines) {
    try {
      queueRows.push(JSON.parse(line));
    } catch {
      reportLines.push(JSON.stringify({ ok: false, error: "invalid queue JSON", raw: line.slice(0, 200) }));
      blocked += 1;
    }
  }

  /** Apply bottom-to-top per file so earlier edits do not break later searchText matches. */
  queueRows.sort((a, b) => {
    const cmp = String(a.filePath || "").localeCompare(String(b.filePath || ""));
    if (cmp !== 0) {
      return cmp;
    }
    return (Number(b.line) || 0) - (Number(a.line) || 0);
  });

  let processed = 0;
  let appliedWrites = 0;
  let validatedEdits = 0;
  let modelSkips = 0;

  for (const row of queueRows) {
    if (processed >= args.max) break;

    const filePath = row.filePath;
    if (!filePath || !fs.existsSync(filePath)) {
      reportLines.push(
        JSON.stringify({ ok: false, filePath, error: "file missing", riskType: row.riskType })
      );
      blocked += 1;
      processed += 1;
      continue;
    }

    const source = fs.readFileSync(filePath, "utf8");
    let decision;
    try {
      decision = await callOpenAi(buildPrompt(row, source));
    } catch (e) {
      reportLines.push(
        JSON.stringify({
          ok: false,
          filePath,
          riskType: row.riskType,
          error: String(e.message || e),
        })
      );
      blocked += 1;
      processed += 1;
      if (args.delayMs) await sleep(args.delayMs);
      continue;
    }

    if (decision.skip) {
      reportLines.push(
        JSON.stringify({
          ok: true,
          applied: false,
          filePath,
          riskType: row.riskType,
          reason: decision.reason || "skipped",
        })
      );
      modelSkips += 1;
      processed += 1;
      if (args.delayMs) await sleep(args.delayMs);
      continue;
    }

    const { searchText, replaceText } = decision;
    if (typeof searchText !== "string" || typeof replaceText !== "string") {
      reportLines.push(
        JSON.stringify({
          ok: false,
          filePath,
          riskType: row.riskType,
          error: "missing searchText or replaceText",
        })
      );
      blocked += 1;
      processed += 1;
      if (args.delayMs) await sleep(args.delayMs);
      continue;
    }

    const n = source.split(searchText).length - 1;
    if (n !== 1) {
      reportLines.push(
        JSON.stringify({
          ok: false,
          filePath,
          riskType: row.riskType,
          error: `searchText must appear exactly once (found ${n})`,
          searchPreview: searchText.slice(0, 120),
        })
      );
      blocked += 1;
      processed += 1;
      if (args.delayMs) await sleep(args.delayMs);
      continue;
    }

    const next = source.replace(searchText, replaceText);
    try {
      parseFileOrThrow(next, filePath);
    } catch (e) {
      reportLines.push(
        JSON.stringify({
          ok: false,
          filePath,
          riskType: row.riskType,
          error: `parse failed after proposed edit: ${e.message}`,
        })
      );
      blocked += 1;
      processed += 1;
      if (args.delayMs) await sleep(args.delayMs);
      continue;
    }

    validatedEdits += 1;
    if (args.write) {
      fs.writeFileSync(filePath, next, "utf8");
    }

    reportLines.push(
      JSON.stringify({
        ok: true,
        applied: Boolean(args.write),
        dryRun: !args.write,
        filePath,
        riskType: row.riskType,
        searchLen: searchText.length,
        replaceLen: replaceText.length,
      })
    );
    if (args.write) appliedWrites += 1;
    processed += 1;
    if (args.delayMs) await sleep(args.delayMs);
  }

  fs.mkdirSync(path.dirname(args.outReport), { recursive: true });
  fs.writeFileSync(args.outReport, `${reportLines.join("\n")}\n`, "utf8");

  process.stdout.write(
    `AI queue: processed=${processed} validatedEdits=${validatedEdits} diskWrites=${appliedWrites} modelSkips=${modelSkips} blocked=${blocked} write=${Boolean(
      args.write
    )}. Report: ${args.outReport}\n`
  );
}

main().catch((e) => {
  process.stderr.write(`${e.stack || e}\n`);
  process.exit(1);
});

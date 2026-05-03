# ethers v5 → v6 migration codemod

Deterministic Babel AST rewrites (aligned with [Migrating from v5](https://docs.ethers.org/v6/migrating/)), risk reporting, and an optional **gated AI** second pass on `ai-queue.jsonl`.

## Install

```bash
npm install
```

## One command: autofix + AI

`npm run migrate` runs the codemod, writes reports under `--out-dir`, then runs the AI worker on the queue when a key is set and the queue is non-empty.

After every run you get a **single combined view**:

| File                        | Purpose                                         |
| --------------------------- | ----------------------------------------------- |
| **`pipeline-summary.md`**   | Autofix counts + AI counts + links (start here) |
| `pipeline-summary.json`     | Same data for tooling                           |
| `report.md` / `report.json` | Per-file autofix detail                         |
| `ai-queue.jsonl`            | Rows sent to the model                          |
| `ai-fix-report.jsonl`       | One result line per queue row                   |

```bash
# Preview: no writes; AI also dry-runs (no AI disk writes)
npm run migrate:dry -- --target /path/to/repo

# Apply codemod + AI (needs OPENAI_API_KEY in .env for step 2)
npm run migrate -- --target /path/to/repo

# Codemod only
npm run migrate -- --target /path/to/repo --no-ai

# Mirror only: `--target` stays read-only; transformed tree + AI edits go to `--emit-to`
npm run migrate -- --target ./src --emit-to ./src-migrated --out-dir migration-report
```

### Fixtures demo (one command)

Leaves **`test/fixtures`** as the v5-style originals; writes the migrated tree to **`test/updates`** and reports to **`migration-report/`**.

```bash
# Autofix into test/updates only (fixtures untouched)
npm run migrate:demo -- --no-ai

# Same, plus AI on the mirror (needs OPENAI_API_KEY)
npm run migrate:demo
```

`migrate:demo` is shorthand for  
`migrate -- --target test/fixtures --emit-to test/updates --out-dir migration-report`.

## Split steps (optional)

```bash
npm run codemod -- --target ./src --out-dir migration-report --write
npm run ai-fix -- --queue migration-report/ai-queue.jsonl --out-report migration-report/ai-fix-report.jsonl
# apply AI edits:
npm run ai-fix:apply -- --queue migration-report/ai-queue.jsonl --out-report migration-report/ai-fix-report.jsonl
```

## Test

```bash
npm test
```

Fixtures and expectations live in `test/fixtures/` and `test/fixtures-manifest.json`.

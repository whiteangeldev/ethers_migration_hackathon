# @whiteangeldev/ethers-v5-to-v6 (Codemod Registry package)

Deterministic **ethers v5 → v6**-style API migration using the same Babel AST logic as this repo’s `src/codemod.js`.

## What it does

- Lifts `ethers.utils.*`, `ethers.providers.*`, and mapped `ethers.constants.*` per the official migration guide.
- Emits `migration-report/` (`report.md`, `report.json`, `ai-queue.jsonl`) under the **target** project.
- **Writes** transformed sources in place (`--write`). Run on a branch or copy.

## Before publish (maintainers)

Sync vendored copies of `src/cli.js` and `src/codemod.js` from the repo root:

```bash
# from repository root
npm run registry:sync
```

Or from this directory: `npm run sync-vendor`  
(`prepublishOnly` runs sync automatically before `npm publish`.)

## Validate

```bash
npx codemod workflow validate -w workflow.yaml
```

## Run locally

From a **git-tracked** project (or any folder you are allowed to modify):

```bash
npx codemod workflow run -w /path/to/this/folder/workflow.yaml --target /path/to/your/app
```

After it is published:

```bash
npx codemod run @whiteangeldev/ethers-v5-to-v6 --target /path/to/your/app
```

## Publish ([docs](https://docs.codemod.com/publishing))

```bash
cd codemods/ethers-v5-to-v6
npm install
npm run sync-vendor
npx codemod login
npx codemod publish
```

Bump `version` in `codemod.yaml` for each publish. The package is scoped as `@whiteangeldev/ethers-v5-to-v6` (your Codemod login user).

## Note

The full hackathon pipeline (AI second pass) lives at the repo root (`npm run migrate`). This registry package ships the **deterministic codemod only**.

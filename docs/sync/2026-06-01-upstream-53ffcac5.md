# 2026-06-01 Upstream Sync Through 53ffcac5

This record documents a selective sync of approved upstream commits after
`3e5b7a5daca93da0bf195275cb6c0cf2a3e667ad` through
`53ffcac5283992361facdfaef0a82a593c2e92fb`.

## Sync Baseline

- Fork head before sync branch work: `0afaec3a8afb89d6380d25d627bf172672c7fe36`
- Upstream evaluated through: `53ffcac5283992361facdfaef0a82a593c2e92fb`
- Previous upstream sync point: `3e5b7a5daca93da0bf195275cb6c0cf2a3e667ad`
- Candidate upstream range evaluated: `3e5b7a5daca93da0bf195275cb6c0cf2a3e667ad..53ffcac5283992361facdfaef0a82a593c2e92fb`

For the next upstream sync, start by reviewing new upstream commits after:
`53ffcac5283992361facdfaef0a82a593c2e92fb`.

## Manual Decisions

- No new product or fork-policy decision was required.
- The Windows command-line parsing fix was accepted as a fork-adapted
  `dev:web` script update because the fork keeps additional root scripts and a
  previously verified web-plus-dependencies dev command shape.

## Accepted Upstream Commits

- `7c26296dd3857f7da34b99bc5298d08c3cc39d63` fix(web): 避免章节翻译前重复同步源站
- `41786e6a9778b5ff83eaf5e670720d2e9f9d47fd` chore: 修复windows环境下命令行解析错误 (#390), accepted as a fork-adapted change rather than a direct cherry-pick.
- `53ffcac5283992361facdfaef0a82a593c2e92fb` fix(web): 修复收藏按钮点击后，UI 状态未更新的问题 (#389)

## Rejected Or Deferred Changes

- Direct upstream merge remains rejected. `main..upstream/main` still deletes
  ThemeGlossary files, fork docs, sync guardrails, and `docker-compose.dev.yml`.
- `2a723e8a45c8ea6833e858c5a47360207682e433` fix(server): 将 points 计数改为 long was not applied because upstream reverted it in the same candidate range.
- `81210ff9f32916f679bb72e2bfe3ba0e23456f98` Revert "fix(server): 将 points 计数改为 long" was not applied because the reverted change was not accepted into the fork.

## Fork Adaptations

- `7c26296d` and `53ffcac5` were applied with `git cherry-pick -x`.
- `41786e6a` was applied manually:
  - root `package.json` now uses Windows-safe double quotes around pnpm filter
    selectors in `dev:web`.
  - the fork's `check:fork` and `check:sync` scripts were preserved.
  - the fork's explicit `@auto-novel/web` plus `@auto-novel/web^...` dev
    filters were preserved instead of switching to upstream's compressed
    selector.
- ThemeGlossary backend and frontend files, DTO fields, repository injection,
  and glossary merge order were not touched by this candidate range.
- `docker-compose.dev.yml`, `AGENTS.md`, `CONTEXT.md`, sync docs, and guardrail
  scripts were preserved.

## Patch-Equivalence Notes

- `7c26296d` and `53ffcac5` are patch-equivalent through direct cherry-pick
  provenance.
- `41786e6a` is intentionally not patch-equivalent because the fork preserves
  additional root scripts and the existing web-plus-dependencies dev command
  shape.
- The `2a723e8a` / `81210ff9` server points pair has no intended net effect for
  the fork.

## Validation

- `.\scripts\check-fork-invariants.ps1` passed with existing local warnings for
  ignored generated frontend declarations.
- `pnpm build` passed. The web build reported the existing large chunk warning.
- `pnpm --stream --filter "@auto-novel/web^..." run build` passed, validating
  the Windows-safe quoted pnpm filter used by the first `dev:web` segment.
- `git diff --check` passed with only the existing Windows line-ending warning
  for `package.json`.

## Next Sync Checklist Addendum

1. Fetch upstream.
2. Compare new candidates from the upstream SHA recorded above.
3. Read the latest `docs/sync/` record before interpreting `git cherry`.
4. Preserve every Fork Capability listed in `AGENTS.md`.
5. Run the normal Upstream Merge Checklist, including Docker build for container
   changes and GitHub Actions checks after push.
6. For fork-adapted upstream sync commits that are not direct `git cherry-pick -x`
   commits, include a `Sync-Manifest: docs/sync/YYYY-MM-DD*.md` trailer.
7. Merge sync PRs with a normal fork PR merge commit or a commit that preserves
   Sync Manifest evidence; do not merge `upstream/main` directly.

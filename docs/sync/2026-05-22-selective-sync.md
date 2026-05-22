# 2026-05-22 Selective Upstream Sync Record

This record documents a fork-adapted selective sync of upstream commits after
`26c3081b28923b04a445dc37812a28ac993be246` through
`e769d6c9c088bbae743ca71cef8d19245b95dab0`.

## Sync Baseline

- Fork head after sync: pending commit, working tree based on `afc5852cdf4f5f05067dee655ece8969d728a687`
- Origin head after sync: `afc5852cdf4f5f05067dee655ece8969d728a687`
- Upstream evaluated through: `e769d6c9c088bbae743ca71cef8d19245b95dab0`
- Merge base with upstream: `ef6731688b7bfa669b6ae4dfe98007eaaf01e586`
- Candidate upstream range evaluated: `26c3081b28923b04a445dc37812a28ac993be246..e769d6c9c088bbae743ca71cef8d19245b95dab0`

For the next upstream sync, start by reviewing new upstream commits after:
`e769d6c9c088bbae743ca71cef8d19245b95dab0`.

## Accepted Groups

- Web crawler and auth/dev environment fixes:
  - `6f99fe4e2489b1d88edfb4a82d273b3474073c1e` Hameln R18 cookie bypass
  - `c6ca9e43953ee0243b6b647ca95e07f65c7359aa` development path and local auth URL handling
- Web UI simplifications and refactors:
  - `f0c9f68043a8db54ae691adab551def7029749d0` remove import-Japanese-to-workspace entry
  - `8d21ed70532209c522e52a2786d56c408330ded1` split download settings button
  - `21ee725448621e16bccf63ab826f71432ea2fefe` move glossary button
  - `feafe4d4caaeb3bb40f2481516bafca008748254` move update-original entry
- Workspace package update:
  - `27890cb17103fba1164b2fb0bc232594ff509529` partial acceptance of upstream PR `auto-novel/auto-novel#369`
- Translator parsing fix:
  - `e769d6c9c088bbae743ca71cef8d19245b95dab0` OpenAI blank-line translation parsing, fork-fixed

## Rejected Or Fork-Adapted Changes

- `4c9ba0af81716e83525d21dc7856b5f33efd034f` was not reapplied because fork
  commit `afc5852cdf4f5f05067dee655ece8969d728a687` already absorbed the auth
  refresh retry behavior and additionally preserves token quote cleanup.
- Upstream root `dev:web` script from `27890cb1` was not accepted verbatim
  because `pnpm -pnpm run build:web-stream ...` fails locally and
  `build:web-stream` is not defined in the repository.
- Upstream production-domain defaults were not allowed to replace
  `books.kotoban.top`.
- Upstream UI refactors were not allowed to drop ThemeGlossary state or update
  paths when moving `GlossaryButton`.
- Upstream `e769d6c9` parser code was not accepted verbatim because it read
  regex group 2, which is the separator, instead of group 3, which is the
  translated content.

## Fork Adaptations

- Root `dev:web` was adapted to the verified pnpm filter form:
  `pnpm --stream --filter '@auto-novel/web^...' run build && pnpm --stream --parallel --filter '@auto-novel/web' --filter '@auto-novel/web^...' run dev`.
- Fork maintenance scripts in root `package.json` were preserved:
  `check:fork` and `check:sync`.
- `web/vite.config.ts` keeps `books.kotoban.top` for fork production defaults
  while adding the Vite alias shape needed by upstream.
- `DownloadOptionsButton.vue` includes fork-required `include-legacy` support
  for download translator selection.
- `GlossaryButton` was moved out of `TranslateOptions.vue`, but web and wenku
  pages still bind and emit `themeGlossaryId` so the fork ThemeGlossary feature
  remains intact.
- The OpenAI prompt parser now preserves original blank lines and uses regex
  group 3 for translated content.

## Patch-Equivalence Notes

Most accepted commits are fork-adapted rather than patch-equivalent because the
fork preserves ThemeGlossary, production-domain overrides, fork maintenance
scripts, and the corrected parser behavior. `git cherry` may still report these
upstream commits as missing even though their accepted behavior is represented
in fork-specific form.

## Validation

- `pnpm -pnpm run build:web-stream --filter '@auto-novel/web^...' run build`
  was tested during PR review and failed with `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL`.
- `pnpm --stream --filter '@auto-novel/web^...' run build` passed.
- `pnpm --filter '@auto-novel/web' --filter '@auto-novel/web^...' list --depth -1`
  selected `@auto-novel/web`, `@auto-novel/crawler`, and `@auto-novel/translator`.
- `pnpm --filter '@auto-novel/translator' test -- openai_prompt.test.ts` first
  failed because `parseAnswer` was missing, then passed after the fork fix.
- `pnpm --filter '@auto-novel/translator' test` passed.
- `pnpm --filter '@auto-novel/translator' run build` passed.
- `pnpm --filter '@auto-novel/web' run build` passed with the existing large
  chunk warning.
- `pnpm --stream --filter '@auto-novel/web^...' run build` passed after full
  implementation.
- `.\scripts\check-fork-invariants.ps1` passed.
- `git diff --check` passed with line-ending warnings only.
- `pnpm --filter '@auto-novel/web' run lint` could not run to completion
  because the unchanged web ESLint flat config fails during config loading with
  `Cannot redefine plugin "@typescript-eslint"`.
- `docker compose -f docker-compose.dev.yml build web api` could not run because
  Docker Desktop's Linux engine pipe was unavailable locally:
  `open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified`.
- `.\scripts\check-selective-feature-sync.ps1 -BaseRef origin/main -HeadRef HEAD`
  is pending until these working-tree changes are committed, because the check
  inspects a commit range.

## Post-Push GitHub Actions

- Not pushed yet.

## Next Sync Checklist Addendum

1. Fetch upstream.
2. Compare new candidates from `e769d6c9c088bbae743ca71cef8d19245b95dab0`.
3. Read the latest `docs/sync/` record before interpreting `git cherry`.
4. Preserve every Fork Capability listed in `AGENTS.md`.
5. Run the normal Upstream Merge Checklist, including Docker build for container
   changes and GitHub Actions checks after push.
6. For fork-adapted upstream sync commits that are not direct `git cherry-pick -x`
   commits, include a `Sync-Manifest: docs/sync/YYYY-MM-DD*.md` trailer.

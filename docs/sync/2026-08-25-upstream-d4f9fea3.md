# 2026-08-25 Upstream Sync Through d4f9fea3

This record documents the selective sync evaluation and integration of upstream
changes after `a3eae7269b45db9912816b2c54e86b2182c1ffc2` through
`d4f9fea3844230715b55d6608cc30632a85d6850`.

## Sync Baseline

- Fork head before sync branch work: `e8b82f9c3db92570e3f303df6d936fc4c94e24d6`
- Origin head before sync branch work: `e8b82f9c3db92570e3f303df6d936fc4c94e24d6`
- Upstream evaluated through: `d4f9fea3844230715b55d6608cc30632a85d6850`
- Previous upstream sync point: `a3eae7269b45db9912816b2c54e86b2182c1ffc2`
- Merge base with upstream: `ef6731688b7bfa669b6ae4dfe98007eaaf01e586`
- Candidate upstream range evaluated: `a3eae7269b45db9912816b2c54e86b2182c1ffc2..d4f9fea3844230715b55d6608cc30632a85d6850`
- Sync branch: `codex/upstream-sync-2026-08-25`

For the next upstream sync, start by reviewing new upstream commits after:
`d4f9fea3844230715b55d6608cc30632a85d6850`.

## Manual Decisions

- The upstream range contains only three commits and no upstream removal of a
  Fork Capability, so the sync artifact is a **Manifested Upstream Cherry-Pick
  Series** applied with `git cherry-pick -x` rather than a curated aggregate
  commit.
- `3a73fcc5` removes the administrator requirement for crawler-driven chapter
  deletion in the web novel TOC update path. Accepted as an upstream product
  decision. Translation-preserving TOC merge behaviour is unchanged, so an
  over-eager crawler update can now drop chapter entries for any user with
  novel access. This is an upstream behaviour change, not a fork regression.
- `d4f9fea3` adds a standalone MongoDB/filesystem export script. It reads the
  `wenku-metadata` collection through `docker compose exec` and the
  `data/files-wenku` volume, both of which match this fork's
  `docker-compose.yml`, so it was accepted unmodified.
- The unsaved-changes confirmation from `d44b8a5f` was extended to cover the
  fork's bound ThemeGlossary selection. Upstream has no such control, so the
  upstream change alone would have let a changed共用术语表 binding be discarded
  without a prompt.

## Accepted Upstream Commits

- `3a73fcc5030072dbf723d7adf7154486d8a40122` —
  `fix(server): 取消爬虫删除章节的管理员限制`. Cherry-picked unmodified.
- `d4f9fea3844230715b55d6608cc30632a85d6850` —
  `feat(script): 新增文库小说信息导出脚本`. Cherry-picked unmodified; adds
  `scripts/export-wenku-novels.py`.
- `d44b8a5fe7fa63b561c4958883cc48eea95af4f4` —
  `feat(web): 術語表modal關閉確認選單`. Cherry-picked with fork adaptation in
  `web/src/components/GlossaryButton.vue`.

## Rejected Or Deferred Changes

- No candidate commit in `a3eae726..d4f9fea3` was rejected or deferred.
- Direct upstream merge remains rejected. The fork continues to diverge from
  upstream on ThemeGlossary, domain configuration, workflows, and
  `docker-compose.dev.yml`.

## Fork Adaptations

- `web/src/components/GlossaryButton.vue`: the upstream conflict was resolved so
  that the ThemeGlossary selector, `ThemeGlossaryApi.list()` loading, the
  `update:themeGlossaryId` emit, and the `@pinia/colada` query-cache
  invalidation all survive alongside the new close-confirmation flow.
- `updateGlossary` now takes both the glossary snapshot and the ThemeGlossary id
  snapshot as parameters. Upstream only snapshotted the glossary; the fork must
  snapshot the binding too so a submit in flight cannot be affected by a later
  selector change.
- `isGlossaryChanged()` compares `localThemeGlossaryId` against a new
  `originalThemeGlossaryId` baseline in addition to upstream's key/value
  comparison, so changing only the bound共用术语表 still triggers the
  confirmation modal.
- `submitGlossary` resets both `originalGlossary` and `originalThemeGlossaryId`
  after a successful submit, so a submitted-then-closed modal does not
  re-prompt.
- ThemeGlossary routes, models, repositories, DTO fields, frontend bindings, and
  glossary merge order remain intact.
- `books.kotoban.top`, `docker-compose.dev.yml`, and portable Docker image
  ownership were untouched by this range.

## Patch-Equivalence Notes

- `3a73fcc5` and `d4f9fea3` are patch-equivalent cherry-picks.
- `d44b8a5f` is not patch-equivalent. Its conflict in `GlossaryButton.vue` was
  resolved in fork-adapted form as described above, so `git cherry` may continue
  to report it as missing. The commit carries both the
  `(cherry picked from commit d44b8a5f...)` line and a `Sync-Manifest:` trailer.

## Validation

- `corepack pnpm install --frozen-lockfile --config.confirmModulesPurge=false`
  passed; lockfile already up to date.
- `.\scripts\check-fork-invariants.ps1` passed. It reported only the expected
  ignored generated declaration warnings for `web/src/auto-imports.d.ts` and
  `web/src/components.d.ts`.
- `.\scripts\check-selective-feature-sync.ps1 -BaseRef origin/main -HeadRef HEAD`
  passed.
- `corepack pnpm --stream -r run build` passed for crawler, translator, daemon,
  and web, including `vue-tsc -b --noEmit`. Vite reported only chunk-size and
  plugin-timing warnings.
- `corepack pnpm --filter @auto-novel/web test` passed: 3 files and 18 tests.
- `npx prettier --check web/src/components/GlossaryButton.vue` reported the
  resolved file as already formatted.
- Crawler and translator tests were not re-run. This range does not touch
  `packages/crawler` or `packages/translator`.
- The server build and targeted server test could not run because this
  workstation has no Java installation and `JAVA_HOME` is unset. The Kotlin
  change is a pure deletion of a permission guard with no new references.
- `docker compose -f docker-compose.dev.yml build web api` could not run because
  the Docker Desktop Linux engine is not available. This range changes no
  container definition.

## Post-Push GitHub Actions

- `codex/upstream-sync-2026-08-25` was merged into `main` with a non-fast-forward
  merge commit and pushed as `e8b82f9c..bca7936d`. The sync branch was pushed as
  well for review history.
- All four workflow runs for the pushed `HEAD` succeeded: Fork Invariants,
  Build, Publish Web, and Publish Api.

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

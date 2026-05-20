# 2026-05-18 Selective Upstream Sync Record

This record documents the selective upstream sync work present on `main`
through `20b7fe79 Update action runtime guardrails`, verified against the
2026-05-18 commit log.

The sync was completed across these fork commits:

- `e9fe66c5 Complete selective upstream feature sync`
- `0ac59777 Sync upstream feature updates`
- `74df076e Strengthen upstream sync guardrails`
- `20b7fe79 Update action runtime guardrails`

## Sync Baseline

- Fork head after sync: `20b7fe79a3e022f1f5e3a080a714a33322302204`
- Origin head after sync: `20b7fe79a3e022f1f5e3a080a714a33322302204`
- Upstream evaluated through: `021ac9c47253ece4d1165bc275048106c635aa43`
- Merge base with upstream: `ef6731688b7bfa669b6ae4dfe98007eaaf01e586`
- Candidate upstream range evaluated: `ef673168..021ac9c4`

For the next upstream sync, start by reviewing new upstream commits after
`021ac9c4`. Do not use `git cherry -v main upstream/main` alone to decide what
is missing, because several accepted changes were integrated as fork-authored
Curated Upstream Sync Commits and are not patch-equivalent to upstream.

## Accepted Changes

The following upstream behavior was accepted, sometimes in fork-adapted form:

- Workspace build and generated declaration policy:
  - Move pnpm build allow-list into workspace settings.
  - Ignore `web/src/auto-imports.d.ts` and `web/src/components.d.ts`.
  - Keep generated declaration files untracked even when generated locally.
- WebNovel crawler maintenance:
  - Add provider-specific fetching support.
  - Support addon-assisted metadata recovery.
  - Adapt Hameln browser-tab fetch behavior and preserve Hameln introduction
    line breaks.
  - Avoid unnecessary WebNovel updates and reject shorter TOC updates.
- Translation maintenance:
  - Retire OpenAI Web Worker Translation.
  - Improve Youdao error handling and English-character detection.
  - Keep Baidu Translation readable as a Legacy Capability instead of removing
    historical Baidu data paths.
- WebNovel metadata UI:
  - Split WebNovel metadata, tags, title, stats, and actions components.
  - Improve readable word-count and point display.
  - Fix tag-query escaping.
  - Adopt the upstream introduction interaction: translated introduction is
    collapsed by default, and expanding shows both translated and original text.
- WebNovel update behavior:
  - Preserve existing translated TOC titles during metadata updates.
  - Allow users with Novel Access to maintain WebNovel metadata and chapter
    content, while preserving admin-only checks for destructive chapter deletion.
- Upstream-compatible maintenance:
  - Refresh selected Docker, workflow, and lockfile maintenance in fork-adapted
    form while preserving fork image ownership and workflow triggers.
- Selective sync guardrails:
  - Add a non-publishing build workflow and strengthen action runtime guards.
  - Strengthen README, CONTEXT, ADR, manifest template, and script checks for
    future selective upstream syncs.

## Rejected Or Fork-Adapted Changes

The following upstream changes must not be reintroduced blindly in the next sync:

- Do not delete ThemeGlossary files, fields, route registrations, repository
  dependencies, or glossary merge logic.
- Do not replace `books.kotoban.top` with upstream `n.novelia.cc`, except that
  `monitor.novelia.cc` remains an allowed external upstream service URL.
- Do not delete `docker-compose.dev.yml`.
- Do not replace portable `${{ github.repository_owner }}` image ownership with
  hardcoded upstream owner values.
- Do not track generated frontend declarations.
- Do not fully remove Baidu-readable DTO/model/reader/export paths. Active Baidu
  translation entry points may remain retired, but stored historical Baidu
  translations must remain readable where practical.
- Do not restore OpenAI Web Worker Translation. Normal OpenAI-compatible API
  translation remains the supported GPT path.
- Do not treat upstream README or AGENTS deletions as applicable to this fork.

## Patch-Equivalence Notes

After this sync, `git cherry -v main upstream/main` still reports many upstream
commits as `+`. That is expected for fork-adapted commits. In particular:

- `c00012fd` is implemented through both API-level TOC title preservation and
  repository-level `mergeUpdatedToc`.
- `021ac9c4` is implemented in the fork introduction component with an added
  `whiteSpace` rule to preserve original-text line breaks when expanded.
- Baidu-removal changes are intentionally not patch-equivalent because the fork
  keeps Baidu as a Readable Translation Source.
- ThemeGlossary-removal changes are intentionally rejected.

The upstream commits that were patch-equivalent after the sync were:

- `f66e824d fix(web): 修复标签查询转义`
- `630d15b0 feat(web): 完善有道翻译错误处理 (#357)`
- `b4ab18fc feat(web): 重构小说详情元数据展示 (#355)`
- `73c98986 feat(web): 提升小说字数展示可读性 (#355)`
- `88926095 feat(web): 将小说点数移到标签区 (#355)`
- `b8a42749 feat(web): 优化小说元数据展示 (#355)`
- `2c18e9f7 feat(web): 调整小说详情信息布局 (#355)`

## Commit-Log Validation

Validation against the 2026-05-18 commit log found the original draft baseline
was stale. `e9fe66c5` only changed `CONTEXT.md`,
`server/src/main/kotlin/api/RouteWebNovel.kt`, and
`web/src/pages/novel/components/WebNovelIntroduction.vue`; the bulk crawler,
translator, frontend, and web/wenku sync changes landed later in
`0ac59777 Sync upstream feature updates`.

The current post-sync main history is:

- `0ac59777 Sync upstream feature updates`
- `74df076e Strengthen upstream sync guardrails`
- `20b7fe79 Update action runtime guardrails`

The current refs are:

- `HEAD`: `20b7fe79a3e022f1f5e3a080a714a33322302204`
- `origin/main`: `20b7fe79a3e022f1f5e3a080a714a33322302204`
- `upstream/main`: `021ac9c47253ece4d1165bc275048106c635aa43`
- `git merge-base HEAD upstream/main`: `ef6731688b7bfa669b6ae4dfe98007eaaf01e586`

## Verification Completed

The original sync notes recorded this local verification before push. The
2026-05-18 commit log validates the commits and refs above, but does not by
itself prove these command outputs:

- `pwsh ./scripts/check-fork-invariants.ps1`
- `pwsh ./scripts/check-selective-feature-sync.ps1 -BaseRef origin/main -HeadRef HEAD`
- `packages/crawler` declaration rebuild via `rslib build`
- `web` Vite build
- `web` Vue typecheck
- `docker compose -f docker-compose.dev.yml build web api`
- `git diff --check`

The original sync notes recorded post-push GitHub Actions for
`e9fe66c589c70f58b5d180c921eea89fa8bff91d` through the GitHub Actions REST API
because `gh` was not installed. That is not current-head CI evidence for
`20b7fe79a3e022f1f5e3a080a714a33322302204`:

- Fork Invariants
- Publish Web
- Publish Api

## Next Sync Checklist Addendum

1. Fetch upstream.
2. Compare new candidates from `021ac9c4..upstream/main`.
3. Read this record before interpreting `git cherry`.
4. Preserve every Fork Capability listed in `AGENTS.md`.
5. Preserve Baidu-readable historical data paths unless there is an explicit
   new decision to drop them.
6. Run the normal Upstream Merge Checklist, including Docker build for container
   changes and GitHub Actions checks after push.
7. For fork-adapted upstream sync commits that are not direct `git cherry-pick -x`
   commits, include a `Sync-Manifest: docs/sync/YYYY-MM-DD*.md` trailer.

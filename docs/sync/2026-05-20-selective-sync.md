# 2026-05-20 Selective Upstream Sync Record

This record documents the selective upstream sync pushed to `main` at
`19e88e2002926735520715258d47f843ebaf7cab`.

## Sync Baseline

- Fork head after sync: `19e88e2002926735520715258d47f843ebaf7cab`
- Origin head after sync: `19e88e2002926735520715258d47f843ebaf7cab`
- Upstream evaluated through: `26c3081b28923b04a445dc37812a28ac993be246`
- Merge base with upstream: `ef6731688b7bfa669b6ae4dfe98007eaaf01e586`
- Candidate upstream range evaluated: `021ac9c4..26c3081b`

For the next upstream sync, start by reviewing new upstream commits after:
`26c3081b28923b04a445dc37812a28ac993be246`.

## Accepted Groups

- Translator package migration and fixes:
  - `82faaf4dcb5ed6ba457c17e6884ad652be144d34` YoudaoTranslator migration
  - `31665af3adaf27435c9e5f81e7a119186370efe9` SakuraTranslator creation API consolidation
  - `26c3081b28923b04a445dc37812a28ac993be246` translator retry fix and cache support
- Web external/addon refactor:
  - `2a9524ca20230e53eed94736013d13721b5bfe52` Addon type migration
  - `f59f0e741babc1886ae37ea969a991d4e7c7cdf6` external adapter consolidation
  - `7de0e266287fa6d6b3ce799526742ff286de9cfc` addon version validation
- Web UI and metadata fixes:
  - `d0c055631cbc3c1cc85e57029abc54da85170f30` full-width title space replacement fix
  - `0d0866162ef90422375bf33f477406217318c759` simplified novel metadata display
- Server fixes:
  - `f1d42ce377a6cccaab88ee247571594d62fe680a` additional fascist novel denylist entries
  - `67783a1219c1e6bfd8f44e368f9d9d84aa78a3ff` strict filename length validation only for upload

## Rejected Or Fork-Adapted Changes

- Upstream ThemeGlossary removals were not accepted. ThemeGlossary files,
  `themeGlossaryId` fields, update-glossary payloads, and translate task
  glossary merge order remain fork capabilities.
- Upstream deletion of `docker-compose.dev.yml`, fork sync scripts, and fork
  maintenance docs was not accepted.
- Upstream production-domain defaults were not allowed to replace
  `books.kotoban.top`.

## Fork Adaptations

- `web/src/domain/translate/TranslatorSakura.ts` was adapted into a thin wrapper
  around the package-level SakuraTranslator API while preserving the web
  SegmentTranslator interface.
- `web/src/domain/crawler/index.ts` was resolved to import crawler metadata
  types and APIs from the new `@/external` layer.
- `web/src/api/index.ts` was patched after the cherry-picks to stop re-exporting
  the removed `./addon` API barrel.

## Patch-Equivalence Notes

The accepted upstream commits were cherry-picked with `-x`, so their upstream
source commits are visible in commit bodies. `git cherry -v main upstream/main`
may still report older upstream commits because earlier syncs were integrated
through fork-authored curated commits rather than upstream-identical patches.

## Validation

- `.\scripts\check-fork-invariants.ps1` passed.
- `.\scripts\check-selective-feature-sync.ps1 -BaseRef origin/main -HeadRef HEAD` passed.
- `git diff --check main..HEAD` passed before merge to `main`.
- `pnpm --filter @auto-novel/translator build` passed.
- `pnpm --filter @auto-novel/web build` passed with the existing large chunk warning.
- Local `server` compile could not run because the environment lacked
  `JAVA_HOME`/`java`; no Kotlin compiler errors were produced locally.

## Post-Push GitHub Actions

For pushed head `19e88e2002926735520715258d47f843ebaf7cab`:

- `Fork Invariants`: success
- `Build`: success
- `Publish Web`: success
- `Publish Api`: success

## Next Sync Checklist Addendum

1. Fetch upstream.
2. Compare new candidates from `26c3081b28923b04a445dc37812a28ac993be246`.
3. Read the latest `docs/sync/` record before interpreting `git cherry`.
4. Preserve every Fork Capability listed in `AGENTS.md`.
5. If the push range contains upstream cherry-picks, update `docs/sync/` in the
   same push range before pushing.
6. For fork-adapted upstream sync commits that are not direct `git cherry-pick -x`
   commits, include a `Sync-Manifest: docs/sync/YYYY-MM-DD*.md` trailer.

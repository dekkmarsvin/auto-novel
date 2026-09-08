# 2026-09-08 Upstream Sync Through db8d9b5f

This record documents the selective sync evaluation and integration of upstream
changes after `d4f9fea3844230715b55d6608cc30632a85d6850` through
`db8d9b5f5758b8b857131c9b5475ac564c116de3`.

## Sync Baseline

- Fork head before sync branch work: `6db29f701adcc7ce14a0dc4cdfb315b0d7120edd`
- Origin head before sync branch work: `6db29f701adcc7ce14a0dc4cdfb315b0d7120edd`
- Upstream evaluated through: `db8d9b5f5758b8b857131c9b5475ac564c116de3`
- Previous upstream sync point: `d4f9fea3844230715b55d6608cc30632a85d6850`
- Merge base with upstream: `ef6731688b7bfa669b6ae4dfe98007eaaf01e586`
- Candidate upstream range evaluated: `d4f9fea3844230715b55d6608cc30632a85d6850..db8d9b5f5758b8b857131c9b5475ac564c116de3`
- Sync branch: `codex/upstream-sync-2026-09-08`

For the next upstream sync, start by reviewing new upstream commits after:
`db8d9b5f5758b8b857131c9b5475ac564c116de3`.

## Manual Decisions

- The range contains two commits, neither touches a Fork Capability, and both
  files were byte-identical to upstream before the sync. The sync artifact is a
  **Manifested Upstream Cherry-Pick Series** applied with `git cherry-pick -x`.
- `fd9a1c39` raises the daily wenku write quota for `UserRole.Trusted` and above
  (novels 100 → 2000, volumes 500 → 10000) by replacing the fixed
  `rateLimiter(limit, refillPeriod)` with a per-call provider. `UserRole` and
  `atLeast` live in the same `api.plugins` package as `RateLimit.kt`, so the
  fork needs no extra import. Accepted as an upstream product decision. Effect on
  the fork: a compromised or misbehaving trusted account can now create far more
  wenku records per day before the limiter stops it; the limiter is still keyed
  per user id, so untrusted accounts are unchanged.
- `db8d9b5f` retries once after a `401`. The fork's `beforeRequest` hook reads
  `tokenGetter()` on every attempt and `useUserData` refreshes the access token
  on an interval, so a request that raced an in-flight token refresh now
  succeeds on the retry instead of failing. `ky.retry()` skips the `shouldRetry`
  check, so non-idempotent methods retry too; that is safe here because a `401`
  is rejected before the handler runs. Accepted unmodified.
- `ky.retry()` and the positional `afterResponse` hook signature
  `(request, options, response, { retryCount })` both exist in the fork's pinned
  `ky@1.14.3`, so no dependency change was needed.

## Accepted Upstream Commits

- `fd9a1c3940c07449550ea911c57712128a8b57f4` —
  `feat(server): 提高信任用户文库写入限额`. Cherry-picked unmodified;
  touches `server/src/main/kotlin/api/plugins/RateLimit.kt`.
- `db8d9b5f5758b8b857131c9b5475ac564c116de3` —
  `fix(web): 401 响应后重试请求`. Cherry-picked unmodified; touches
  `web/src/api/novel/client.ts`.

## Rejected Or Deferred Changes

- No candidate commit in `d4f9fea3..db8d9b5f` was rejected or deferred.
- Direct upstream merge remains rejected. The fork continues to diverge from
  upstream on ThemeGlossary, domain configuration, workflows, and
  `docker-compose.dev.yml`.

## Fork Adaptations

- None. Both files matched upstream exactly before the cherry-picks and both
  applied without conflict.
- ThemeGlossary routes, models, repositories, DTO fields, frontend bindings, and
  glossary merge order are untouched by this range.
- `books.kotoban.top`, `auth.kotoban.top`, `docker-compose.dev.yml`, and portable
  Docker image ownership are untouched by this range.

## Patch-Equivalence Notes

- Both commits are patch-equivalent cherry-picks and carry
  `(cherry picked from commit ...)` lines. No `Sync-Manifest:` trailer is
  required for them; the trailer is carried by the manifest commit.

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
- `npx prettier --check web/src/api/novel/client.ts` reports a style warning on
  this workstation only. The checked-out file has CRLF endings because
  `core.autocrlf=true`; with `\r` stripped the file is byte-identical to
  Prettier's output, so the committed content is correctly formatted.
- Crawler and translator tests were not re-run. This range does not touch
  `packages/crawler` or `packages/translator`.
- The server build and targeted server tests could not run because this
  workstation has no Java installation and `JAVA_HOME` is unset. The Kotlin
  change only swaps a constant limiter for a provider lambda using
  `UserRole.Trusted` and `atLeast`, both declared in the same `api.plugins`
  package, so it introduces no new import. CI `Build` covers the compile.
- `docker compose -f docker-compose.dev.yml build web api` could not run because
  the Docker Desktop Linux engine is not available. This range changes no
  container definition.

## Post-Push GitHub Actions

- Not pushed yet at the time this manifest was written. Record the run results
  here after pushing.

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

# 2026-10-22 Upstream Convergence Through aead47d1

## Baselines and approval

- Fork baseline: `157ea6665630e69b2c8a1dcc47713aab9d762770`.
- Candidate upstream range evaluated: `fd90b2d4d927f87d9d31c6a70c1d37209f8b16f6..aead47d1fdb6494aad05bd14be61fea09ff702a9`, 12 commits.
- Upstream evaluated through: `aead47d1fdb6494aad05bd14be61fea09ff702a9`.
- Next upstream sync starting SHA: `aead47d1fdb6494aad05bd14be61fea09ff702a9`.
- Auto-Novel-selected Web Kit: `9285460e2f48f4685c7994e9717453002aa0392e`.
- Forum client: `1cc0de616c9d89c5a5043c912f625c04c1515d76` (community remains disabled).
- Companion Auth upstream target: `9285460e2f48f4685c7994e9717453002aa0392e`, independently fork-adapted from Auth `76434ec856009c5a240e315ec69309f7c2e1fcb7`; see that repository's dated sync manifest for its final release revision.
- Paired Auth fork revision: `c939cfcc5f8eb86e5b5831115cc5d0f578ee64b6`, [Auth PR #1](https://github.com/dekkmarsvin/auth/pull/1).

For the next upstream sync, start by reviewing new upstream commits after: `aead47d1fdb6494aad05bd14be61fea09ff702a9`.

## Manual Decisions

The maintainer explicitly approved updating AGENTS/ADR first, keeping
ThemeGlossary, NAILAIN and necessary deployment/security differences, importing
old GPT settings before retiring old GPT and Interactive, and upgrading Web Kit
and Auth with compatibility verification. AGENTS/ADR were updated before source
integration. This supersedes the two deferred retirements in the October 20
manifest. Production deployment is not part of this implementation request.

## Accepted Upstream Commits

- `1c678850`, `e224a084`, `4f3f8e43`: exact upstream-selected SDK, shared
  Markdown editor/content/parser, VueUse and accompanying dependency updates.
- `0ebd6568`, `6c355fde`, `335dae51`, `ee465f7e`, `283ceedc`, `62521014`,
  `1b2f96be`: shared comment presentation, permissions, editing/moderation,
  blacklist, account-cache isolation and theme behavior; all remain behind the
  installation's disabled community boundary.
- `d5140a7f`: explicit image-URL extension validation for Wenku covers.
- `aead47d1`: centralized external links and shared comment Markdown help.
- Previously deferred `8e724719`, `77404b8b`: retire old GPT UI/modal and
  Interactive/unused OpenAI adapter. Keep old Sakura with upstream's deprecated
  label; `/workspace` defaults to Sakura Pipeline.

## Rejected Or Deferred Changes

- Keep the installation's local cover placeholder and disabled community rather
  than adopting upstream's default CDN/forum installation configuration.
- Do not delete any original worker/job/history/cache/server data or backups.
- Old Sakura is still present upstream and is not retired ahead of upstream.
- No additional legacy GPT/Interactive retirement remains deferred.

## Fork Adaptations

- Preserve all ThemeGlossary models/routes/DI, theme-before-novel term order,
  editor drafts/navigation guards and username ownership with the selected SDK.
- Preserve NAILAIN providers, public reads, administrator-only password settings,
  fallback configuration and both offline test layers.
- Before creating the GPT Pipeline store, import only old API worker settings.
  Existing Pipeline workers/fields take precedence; equal connections deduplicate
  and conflicting names gain deterministic legacy suffixes. Normalize only the
  imported copy of old defaults. Write/read back the target before marking the
  import complete; failures can retry without duplicating workers.
- Original `workspace-gpt`, shared jobs/history and IndexedDB caches are retained.
  No data-service collection or backup is removed. The old history UI and
  arbitrary-text translation UI are intentionally retired, without replacements.
  The small worker importer can exit once supported profiles have transitioned.
- Keep Kotoban domains, fork repository/image identity, dev Compose/data mounts,
  local/native credential isolation, one-time auth/theme migration, new-key
  precedence and logout protection. No SDK source customization is introduced.
- Replace the old Markdown implementation with SDK components plus a small
  novel-link host adapter, including NAILAIN and safe malformed-link fallback.
  Keep the installation's existing local cover placeholder rather than adding
  an upstream CDN dependency. Keep community clients lazy and queries disabled.
- Preserve independently useful security/readiness/error-recovery fixes, focused
  regressions, portable CI actions and the existing Node build toolchain.

## Validation

- Frozen pnpm 11.28.5 installation and full recursive workspace build passed,
  including Web/Admin vue-tsc, shared package declarations and daemon output.
  Known Vite configuration/chunk/older-browser BigInt warnings remain warnings.
- Web: all 214 tests across 37 files passed, including actual SDK native login,
  session/logout/cross-tab behavior, ThemeGlossary ownership/drafts/navigation,
  NAILAIN settings, browser crawling/cancellation and bounded worker import.
- Admin: 31 tests across 7 files; translator: 66; crawler NAILAIN/Pixiv offline:
  15; daemon: 24; built storage bootstrap: 3. All passed. Admin/Web use bounded
  test worker concurrency; no assertion or timeout was relaxed.
- Daemon active-entry/routes typecheck and fork invariants passed. Generated
  frontend declarations are present locally but remain ignored/untracked.
- Independent review caught malformed Markdown HTTP URLs throwing in the host
  adapter; safe parsing and the real SDK-parser regression now pass.
- Auth's own manifest records its full frontend/SDK, Go unit/vet/integration,
  schema/config and Web/API container results, plus independent review.
- Docker-compatible Podman Compose 5.5.1 successfully ran
  `podman compose --parallel 1 -p codex-auto-novel-sync-20261022 -f docker-compose.dev.yml build web api`.
  Local Web image: `448c18c7918f23d50f0433701852f6619341b1b9f63e4fab7b2475f2dad156f5`;
  API image: `caf19825224af2185f2480e444f9bf0e966e20a5adaa1cb81078577f6185eb18`.
  These are test images, not a production rollout.
- Actual browser smoke used the real built Auto-Novel/Auth frontends with all
  network endpoints replaced by loopback fixtures and an external-network CSP.
  Verified old GPT redirect, both same-named workers with their distinct
  settings, shared job visibility, no duplicate import after reload, native
  login, cookie refresh, administrator mode and logout. Registration/reset links
  rendered their corresponding real Auth forms with app/theme/return parameters;
  no OTP, registration, password change or model invocation was submitted.
- Browser inspection confirmed unchanged legacy worker/history values, shared
  job identity and existing Pipeline fields. Ordinary Pipeline preparation adds
  `progress` to the shared job, so the entire source JSON is not claimed byte
  identical after using the app; the importer itself never writes the source.
- Functional revision `a9b88909645779162d75010c7ffcaf92e7d8834f` passed all four
  PR checks: workspace-build, admin-sync-authorization, Go API and fork/sync
  invariants ([Build](https://github.com/dekkmarsvin/auto-novel/actions/runs/39639204744),
  [Fork Invariants](https://github.com/dekkmarsvin/auto-novel/actions/runs/39639204682)).
  Paired Auth `c939cfcc` passed [Build](https://github.com/dekkmarsvin/auth/actions/runs/39639155167).
  The final documentation-only revision's checks are tracked on
  [Auto-Novel PR #31](https://github.com/dekkmarsvin/auto-novel/pull/31).

Offline/fixture tests do not prove live crawler/model availability, real mail
delivery or production sign-in. No real OTP, email, glossary or translation
mutation is used for tests.

## Release Boundary

Treat Auto-Novel Web, Auth Web and Auth API as one compatible release set.
Verify native login, refresh/logout/session/admin state, registration/reset
deep links and exact Kotoban return allowlists, OTP actions and local/native
isolation before release. Retain all three previous application images for
coordinated rollback; do not roll back only the book site's old iframe SDK while
leaving a new Auth page without that login flow. Preserve existing data services,
credentials, Turnstile hostname policy and mounts. No schema migration is needed.

Curated sync commit trailer:
`Sync-Manifest: docs/sync/2026-10-22-upstream-aead47d1.md`.

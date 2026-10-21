# 2026-10-22 Upstream Convergence Through aead47d1

## Baselines and approval

- Fork baseline: `157ea6665630e69b2c8a1dcc47713aab9d762770`.
- Candidate upstream range evaluated: `fd90b2d4d927f87d9d31c6a70c1d37209f8b16f6..aead47d1fdb6494aad05bd14be61fea09ff702a9`, 12 commits.
- Upstream evaluated through: `aead47d1fdb6494aad05bd14be61fea09ff702a9`.
- Next upstream sync starting SHA: `aead47d1fdb6494aad05bd14be61fea09ff702a9`.
- Auto-Novel-selected Web Kit: `9285460e2f48f4685c7994e9717453002aa0392e`.
- Forum client: `1cc0de616c9d89c5a5043c912f625c04c1515d76` (community remains disabled).
- Companion Auth upstream target: `9285460e2f48f4685c7994e9717453002aa0392e`, independently fork-adapted from Auth `76434ec856009c5a240e315ec69309f7c2e1fcb7`; see that repository's dated sync manifest for its final release revision.

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
- Local Auto-Novel image builds, loopback browser smoke and exact-head CI are
  recorded at final delivery. No production operation is performed here.

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

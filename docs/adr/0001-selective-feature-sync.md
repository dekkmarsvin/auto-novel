# Adopt Selective Feature Sync for Upstream Changes

This fork treats upstream `auto-novel/auto-novel` changes as candidate changes, not as an automatic source of truth. We adopt upstream user value and bug fixes through **Selective Feature Sync** while preserving fork-specific **Fork Capabilities** such as ThemeGlossary, `books.kotoban.top` domain configuration, and `docker-compose.dev.yml`.

This is a deliberate trade-off against full upstream parity. It reduces the chance of losing fork capabilities during merges, while allowing explicitly reviewed **Legacy Capabilities** to follow upstream removal when their maintenance cost no longer serves the fork.

On 2026-10-14 the maintainer approved retiring the unused built-in forum and
comments. Subsequent evaluated upstream groups should follow the upstream core
architecture, with differences concentrated in ThemeGlossary, site configuration,
deployment identity, and necessary security/regression fixes. Existing community
data is retained; the upstream community UI is disabled at a single deployment
boundary until an installation explicitly configures its own service.

On 2026-10-22 the maintainer approved upstream convergence with an explicit,
small permanent exception set: ThemeGlossary, NAILAIN, installation configuration
and necessary security/data-integrity boundaries. General Pipeline, Web Kit,
Markdown and UI behavior follows upstream. This supersedes the earlier decision
to defer old GPT and Interactive retirement.

The old GPT page may retire after a bounded, non-overwriting browser worker
migration to Pipeline. GPT jobs already use the shared queue; original worker
and history data remains available for recovery. Interactive retires without a
replacement arbitrary-text tool. Old Sakura follows upstream's retirement
schedule. Retiring code does not authorize deletion of browser caches, server
collections, content or backups, and does not promise a replacement history UI.

Web Kit follows Auto-Novel's selected revision without SDK-local patches. The
independent Auth Web/API follows a compatible upstream release with Kotoban
domains, exact return/CORS/Turnstile configuration and existing security
protections. Treat the two repositories as a compatible release set with
coordinated validation and rollback. Temporary old/new login compatibility is
limited to a documented transition, rather than a permanent second login path.
Local/native credential isolation and one-time storage/new-key/logout safety
remain required. Each new compatibility adapter needs an explicit exit
condition; do not build new generic frameworks for retired behavior.

The 2026-11-03 approval integrates the reviewed translation-library, task-lifecycle,
workspace and cache changes through `65f40dc0` as one coherent implementation.
The isolated segment cache may cold-start without deleting old browser data.
GPT Pipeline settings retain their existing importer, Web Lock, conflict checks
and confirmed-save behavior in the new UI. ThemeGlossary remains on the server's
merged glossary contract and the relocated toolbox retains its management UI.
NAILAIN uses the same provider and task factory as other sources.

Web Kit is now an independent upstream dependency. Auto-Novel uses `9c479ae7`
while the compatible Auth Admin uses `b6277d5`, matching each consumer's upstream
selection. The unchanged authentication protocol does not require another
iframe/native transition or forced API deployment. Shared SDK code stays
unmodified; installation links, disabled community and navigation remain host
adaptations. The new free-text trial dialog stays unmounted under the existing
Interactive retirement policy. The archived Sakura route and all original data
are retained in this snapshot. Deployment is authorized after full validation,
exact-head CI, published-image provenance and recoverable NAS rollout checks.

The 2026-11-07 approval follows upstream through `0aa0d238` and its unmodified
Web Kit `7af98d68`, including the matching host error-handling/UI changes.
Auth remains at fork `4aa104ef` / upstream `cdc91ef1` with SDK `b6277d5`:
the unchanged authentication wire contract requires paired compatibility checks,
not a forced Auth upgrade. Retire the old Sakura UI and legacy translation
adapters now that upstream has done so. Redirect its URLs to Pipeline and retain
the shared `workspace-sakura` workers/jobs plus all original history/cache data.
Keep pending term inputs inside existing ThemeGlossary draft/navigation safety.
Preserve scoped GPT Pipeline storage locks, importer and confirmed-save behavior
while accepting the shared runtime/timeout/retry improvements. The release may
be merged and deployed after local verification, exact-head CI, image provenance
and a recoverable rollout of changed Auto-Novel services; Auth/data services stay
at their verified current identities.

The 2026-11-09 approval integrates the evaluated range `0aa0d238..9d0013f7`
and Auto-Novel's unmodified SDK `b413db75`. Accept Pixiv completion/time fixes,
Sakura retry-error propagation, guarded touch navigation and the shared
bootstrap/build/Admin direction. Keep the existing host storage-migration
ordering, three API modes, credential/proxy isolation, remote Auth routes/assets,
browser target and source/image metadata. Adapt the host to the new HTML plugin
rather than patching SDK source or creating another authentication framework.
Auth stays at `4aa104ef` with SDK `b6277d5`; its wire contract is unchanged.
The one-hour public Banner cache is an intentional delay tradeoff, with accurate
host wording and all Admin save/upload protections retained. Sakura Share's
working API remains configured independently of its failed monitoring pages.
No source sync authorizes deleting original data or deploying a new fallback
provider. Delivery requires full verification, exact-head CI, registry/runtime
provenance and recoverable updates of only changed NAS services.

Consequences:

- Upstream merges must preserve fork invariants and run `.\scripts\check-fork-invariants.ps1`.
- Changes that remove or alter a **Fork Capability** require explicit review instead of automatic acceptance.
- Changes that affect a **Legacy Capability** may be accepted when they reduce maintenance burden and the compatibility impact is explicitly reviewed.
- Legacy Article/Comment code and local username blacklists are retired. Do not
  restore them during sync or implicitly enable upstream's public forum.
- Use the SDK Git revision selected by Auto-Novel upstream; companion Auth
  service releases are tracked independently against the same token/API contract.
- A **Disposable Merge Staging Branch** may be used to resolve conflicts and inspect a large upstream tree, but it is not an acceptable final artifact for main.
- The final upstream sync artifact may be either a **Curated Upstream Sync Commit** whose first parent is the fork branch and whose diff represents the accepted upstream value plus fork adaptations, or a **Manifested Upstream Cherry-Pick Series** applied with `git cherry-pick -x`.
- Each completed upstream sync must include or reference a **Sync Manifest** that records the upstream range, accepted groups, rejected removals, fork adaptations, patch-equivalence notes, the next sync starting point, and validation commands.
- Fork-adapted upstream sync commits that are not direct `git cherry-pick -x` commits must include a `Sync-Manifest:` commit-message trailer.
- Upstream sync validation must include the full workspace build (`npm run build`) before treating the sync as ready. Touched-area checks are additional, not a replacement. CI should run this as a non-publishing check before deployment workflows are relied on.
- Pure engineering maintenance from upstream may be adopted proactively as **Upstream-Compatible Maintenance** when it preserves **Fork Capabilities**, fork domain configuration, and fork image ownership.
- Docker, CI, dependency, and lockfile updates should follow upstream direction only in fork-adapted form when reproducibility or deployment identity would otherwise change.
- The **Upstream-Compatible Maintenance** allow-list is `pnpm-lock.yaml`, `web/Dockerfile`, `.github/workflows/*.yml`, `.dockerignore`, and `.gitignore`.
- `docker-compose*.yml`, fork domain and banner strings, fork invariant scripts, and ThemeGlossary paths are outside the allow-list and require explicit review.
- Baidu Translation is no longer protected as a frontend readable source. Frontend translator types and reader/download selectors should follow upstream removal; retained storage fields require a separate migration decision before deletion.
- `web/Dockerfile` should follow upstream's Node image and pnpm activation strategy by default, even when that uses floating image tags, because upstream carries more operational exposure for this build path and following it reduces fork maintenance burden.
- `.dockerignore` should keep recursive monorepo ignores such as `**/dist` and `**/node_modules`, even when upstream uses root-only ignores, to avoid sending package-level build outputs or dependencies into Docker build contexts.
- `.gitignore` should not follow upstream removals of local-noise patterns such as `*.log` and `.antigravity-images` unless those patterns cause a concrete maintenance problem.
- `pnpm-lock.yaml` may follow upstream refreshes directly when direct dependency manifests are unchanged, provided install, web build, fork checks, and container builds still pass.
- GitHub Actions runtime deprecation warnings should be handled proactively by upgrading actions or replacing unmaintained actions, while preserving fork image ownership and workflow triggers.
- Each completed upstream sync should leave a dated record in `docs/sync/` with the upstream SHA evaluated, accepted fork-adapted changes, rejected upstream changes, and verification results. Future syncs should read the latest record before using patch-equivalence output such as `git cherry`.

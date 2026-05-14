# Adopt Selective Feature Sync for Upstream Changes

This fork treats upstream `auto-novel/auto-novel` changes as candidate changes, not as an automatic source of truth. We adopt upstream user value and bug fixes through **Selective Feature Sync** while preserving fork-specific **Fork Capabilities** such as ThemeGlossary, `books.kotoban.top` domain configuration, and `docker-compose.dev.yml`.

This is a deliberate trade-off against full upstream parity. It reduces the chance of losing fork capabilities during merges, while allowing **Legacy Capabilities** such as Baidu Translation to lose active entry points when upstream removes them, provided existing data remains readable where practical.

Consequences:

- Upstream merges must preserve fork invariants and run `.\scripts\check-fork-invariants.ps1`.
- Changes that remove or alter a **Fork Capability** require explicit review instead of automatic acceptance.
- Changes that affect a **Legacy Capability** may be accepted when they reduce maintenance burden without unnecessarily breaking historical data compatibility.
- Pure engineering maintenance from upstream may be adopted proactively as **Upstream-Compatible Maintenance** when it preserves **Fork Capabilities**, **Legacy Capability** readability, fork domain configuration, and fork image ownership.
- Docker, CI, dependency, and lockfile updates should follow upstream direction only in fork-adapted form when reproducibility or deployment identity would otherwise change.
- The **Upstream-Compatible Maintenance** allow-list is `pnpm-lock.yaml`, `web/Dockerfile`, `.github/workflows/*.yml`, `.dockerignore`, and `.gitignore`.
- `docker-compose*.yml`, fork domain and banner strings, fork invariant scripts, ThemeGlossary paths, and Baidu readable paths are outside the allow-list and require explicit review.
- `web/Dockerfile` should follow upstream's Node image and pnpm activation strategy by default, even when that uses floating image tags, because upstream carries more operational exposure for this build path and following it reduces fork maintenance burden.
- `.dockerignore` should keep recursive monorepo ignores such as `**/dist` and `**/node_modules`, even when upstream uses root-only ignores, to avoid sending package-level build outputs or dependencies into Docker build contexts.
- `.gitignore` should not follow upstream removals of local-noise patterns such as `*.log` and `.antigravity-images` unless those patterns cause a concrete maintenance problem.
- `pnpm-lock.yaml` may follow upstream refreshes directly when direct dependency manifests are unchanged, provided install, web build, fork checks, and container builds still pass.
- GitHub Actions runtime deprecation warnings should be handled proactively by upgrading actions or replacing unmaintained actions, while preserving fork image ownership and workflow triggers.

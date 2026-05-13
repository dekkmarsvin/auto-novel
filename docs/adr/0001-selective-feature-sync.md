# Adopt Selective Feature Sync for Upstream Changes

This fork treats upstream `auto-novel/auto-novel` changes as candidate changes, not as an automatic source of truth. We adopt upstream user value and bug fixes through **Selective Feature Sync** while preserving fork-specific **Fork Capabilities** such as ThemeGlossary, `books.kotoban.top` domain configuration, and `docker-compose.dev.yml`.

This is a deliberate trade-off against full upstream parity. It reduces the chance of losing fork capabilities during merges, while allowing **Legacy Capabilities** such as Baidu Translation to lose active entry points when upstream removes them, provided existing data remains readable where practical.

Consequences:

- Upstream merges must preserve fork invariants and run `.\scripts\check-fork-invariants.ps1`.
- Changes that remove or alter a **Fork Capability** require explicit review instead of automatic acceptance.
- Changes that affect a **Legacy Capability** may be accepted when they reduce maintenance burden without unnecessarily breaking historical data compatibility.

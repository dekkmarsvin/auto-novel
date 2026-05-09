# Auto-Novel Fork — Agent Context

This repository is a **fork** of [auto-novel/auto-novel](https://github.com/auto-novel/auto-novel).

## Critical Rules

### 1. ThemeGlossary Must Be Preserved

**ThemeGlossary (共用主題術語表) is the core reason this fork exists.**

The upstream has removed this feature entirely. When merging upstream updates, you MUST:
- **Never delete** ThemeGlossary-related files
- **Never remove** `themeGlossaryId` fields from models or DTOs
- **Never remove** `themeGlossaryRepo` dependencies from translate APIs
- **Restore** any ThemeGlossary code that upstream deletes during merge

#### ThemeGlossary Files (exhaustive list)

**Backend (Kotlin):**
- `server/src/main/kotlin/api/RouteThemeGlossary.kt` — API routes & service
- `server/src/main/kotlin/infra/common/ThemeGlossary.kt` — data model
- `server/src/main/kotlin/infra/common/ThemeGlossaryRepository.kt` — MongoDB repository
- `server/src/main/kotlin/Application.kt` — DI registration (`ThemeGlossaryRepository`, `ThemeGlossaryApi`, `routeThemeGlossary()`)
- `server/src/main/kotlin/api/RouteWebNovel.kt` — `themeGlossaryId` in DTO, `themeGlossaryRepo` in TranslateV2Api, glossary merging logic
- `server/src/main/kotlin/api/RouteWenkuNovel.kt` — same pattern as RouteWebNovel
- `server/src/main/kotlin/infra/web/WebNovel.kt` — `themeGlossaryId` field
- `server/src/main/kotlin/infra/wenku/WenkuNovel.kt` — `themeGlossaryId` field
- `server/src/main/kotlin/infra/MongoClient.kt` — `THEME_GLOSSARY` collection constant

**Frontend (TypeScript/Vue):**
- `web/src/api/novel/ThemeGlossaryApi.ts` — API client
- `web/src/model/ThemeGlossary.ts` — TypeScript model
- `web/src/components/GlossaryButton.vue` — glossary selector with theme glossary support
- `web/src/pages/workspace/components/ToolboxItemThemeGlossary.vue` — workspace management UI
- `web/src/pages/novel/components/TranslateOptions.vue` — passes themeGlossaryId prop
- `web/src/pages/novel/components/WebNovelWide.vue` — binds themeGlossaryId
- `web/src/pages/novel/components/WebTranslate.vue` — passes themeGlossaryId prop
- `web/src/api/novel/WebNovelApi.ts` — `themeGlossaryId` in updateGlossary
- `web/src/api/novel/WenkuNovelApi.ts` — `themeGlossaryId` in updateGlossary
- `web/src/model/WebNovel.ts` — `themeGlossaryId` field

### 2. Domain Configuration

This fork uses `books.kotoban.top` as its production domain.
The upstream uses `n.novelia.cc`.

When merging upstream, replace all hardcoded `n.novelia.cc` references with `books.kotoban.top` in:
- `web/vite.config.ts` — `apiUrl` default and `/files-extra` proxy target
- `web/src/components/markdown/MarkdownView.vue` — `currentHost` fallback
- `web/src/util/useUserData/api.ts` — auth domain comment

Exception: `monitor.novelia.cc` is an upstream external service URL — do NOT replace it.

### 3. Docker Image Owner

This fork uses `dekkmarsvin` (not `auto-novel`) as the Docker image owner.
CI/CD workflows use `${{ github.repository_owner }}` to stay portable.

### 4. Dev Compose File

`docker-compose.dev.yml` is maintained in this fork for local development builds.
The upstream has deleted this file — do not delete it during merges.

## Architecture Overview

- **web/** — Vue 3 + Vite 8 frontend (Caddy serves static + reverse proxy to API)
- **server/** — Ktor (Kotlin) backend API
- **packages/crawler/** — Web novel crawler library (rslib)
- **packages/translator/** — Translation pipeline library (rslib)
- **daemon/** — Background tasks (Node.js)

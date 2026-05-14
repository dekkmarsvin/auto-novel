# Auto-Novel Fork

This context describes how this fork relates to upstream while preserving fork-specific product capabilities.

## Language

**Selective Feature Sync**:
An upstream synchronization policy that adopts upstream user value and bug fixes only after preserving fork-specific capabilities.
_Avoid_: Full upstream sync, blind upstream merge

**Curated Upstream Sync Commit**:
A fork-authored commit that manually integrates selected upstream changes instead of merging upstream wholesale.
_Avoid_: Merge commit, upstream parity commit

**Fork Capability**:
A product capability that this fork intentionally preserves even when upstream removes or changes it.
_Avoid_: Local patch, temporary customization

**Legacy Capability**:
A product capability that may remain readable for compatibility but does not need new UI or active maintenance.
_Avoid_: Fork capability, supported feature

**Baidu Translation**:
A legacy machine-translation path whose existing data may remain readable while its active translation entry points can follow upstream removal.
_Avoid_: Required translator

**OpenAI Web Worker Translation**:
A legacy GPT translation path that calls the ChatGPT web backend instead of a compatible OpenAI-style API endpoint.
_Avoid_: GPT translation, OpenAI API translation

**Addon-Assisted Recovery**:
A recovery path where the browser addon fetches WebNovel metadata after the backend cannot load an existing novel.
_Avoid_: Automatic backend sync, normal import

**Novel Access**:
The permission level for users allowed to create, update, or maintain novel-related data.
_Avoid_: Admin-only access, public access

**Introduction Translation Toggle**:
A WebNovel reading interaction that switches the displayed introduction between original text and translated text.
_Avoid_: Introduction rewrite, metadata update

**Provider-Specific Fetching**:
A crawler capability where each WebNovel provider may use its own request strategy.
_Avoid_: Global crawler client, one-size-fits-all fetching

**Upstream**:
The original `auto-novel/auto-novel` project used as a source of candidate changes.
_Avoid_: Source of truth

## Relationships

- **Selective Feature Sync** evaluates changes from **Upstream**
- **Curated Upstream Sync Commit** is the preferred implementation form for **Selective Feature Sync**
- **Selective Feature Sync** preserves every **Fork Capability**
- **Selective Feature Sync** may remove active entry points for a **Legacy Capability**
- **Baidu Translation** is a **Legacy Capability**
- **OpenAI Web Worker Translation** is a **Legacy Capability**
- **Addon-Assisted Recovery** is triggered only after a WebNovel lookup fails
- **Novel Access** is sufficient for WebNovel metadata updates
- **Introduction Translation Toggle** changes presentation, not WebNovel metadata
- **Provider-Specific Fetching** supports provider constraints such as Hameln browser-tab requests

## Example Dialogue

> **Dev:** "Upstream removed ThemeGlossary while adding crawler fixes. Should we take the merge as-is?"
> **Domain expert:** "No. This fork uses **Selective Feature Sync**: take the crawler fixes only after preserving ThemeGlossary as a **Fork Capability**."
>
> **Dev:** "Should the sync be represented by a direct upstream merge commit?"
> **Domain expert:** "No. Use a **Curated Upstream Sync Commit** so accepted upstream changes and rejected removals are explicit."
>
> **Dev:** "Upstream removed the Baidu translation buttons. Is that the same as removing ThemeGlossary?"
> **Domain expert:** "No. **Baidu Translation** is a **Legacy Capability**: keep old data readable, but active entry points can be removed."
>
> **Dev:** "Upstream removed ChatGPT web backend worker support. Is that part of GPT translation?"
> **Domain expert:** "No. **OpenAI Web Worker Translation** is a **Legacy Capability**; keep normal OpenAI-compatible API translation as the supported GPT path."
>
> **Dev:** "If a WebNovel page fails to load, can the browser addon create it?"
> **Domain expert:** "Yes, through **Addon-Assisted Recovery**. Do not describe it as normal backend sync."
>
> **Dev:** "Should only admins be able to update WebNovel metadata?"
> **Domain expert:** "No. Users with **Novel Access** may maintain novel-related data, including WebNovel metadata updates."
>
> **Dev:** "Does switching the introduction between Japanese and Chinese update the novel?"
> **Domain expert:** "No. **Introduction Translation Toggle** is only a presentation choice."
>
> **Dev:** "Should all crawler providers share the same HTTP client?"
> **Domain expert:** "No. Use **Provider-Specific Fetching** when a provider needs a distinct request strategy."

## Flagged Ambiguities

- "upstream sync" was used ambiguously between full upstream parity and selective adoption. Resolved: this fork uses **Selective Feature Sync**.
- "sync commit" was ambiguous between direct upstream merge and manual integration. Resolved: use a **Curated Upstream Sync Commit**.
- "百度翻譯" was used ambiguously between an actively supported translator and historical translation compatibility. Resolved: **Baidu Translation** is a **Legacy Capability**.
- "OpenAI web worker" could mean normal GPT translation or a ChatGPT web-backend integration. Resolved: **OpenAI Web Worker Translation** is legacy; OpenAI-compatible API translation remains supported.
- "補錄小說" could mean normal import, sync, or recovery. Resolved: addon-based creation after a failed lookup is **Addon-Assisted Recovery**.
- "更新小說權限" could mean admin-only moderation or normal novel maintenance. Resolved: WebNovel metadata updates require **Novel Access**, not admin-only access.
- "簡介切換" could mean editing metadata or changing presentation. Resolved: switching original/translated introduction display is **Introduction Translation Toggle**.
- "crawler client" was ambiguous between one global HTTP client and provider-level request strategies. Resolved: crawler code may use **Provider-Specific Fetching**.

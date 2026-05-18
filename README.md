# AutoNovel 轻小说机翻机器人（Fork）

[![GPL-3.0](https://img.shields.io/github/license/auto-novel/auto-novel)](https://github.com/auto-novel/auto-novel#license)

> 重建巴别塔！！

本项目是 [auto-novel/auto-novel](https://github.com/auto-novel/auto-novel) 的 Fork 版本。

**站点网址：[https://books.kotoban.top/](https://books.kotoban.top/)**

## Fork 差异

本 Fork 与上游的主要差异如下：

### 🔖 共用主題術語表（ThemeGlossary）

ThemeGlossary 是本 Fork 基于个人使用需求新增并维护的功能；上游项目未包含此功能。

它用于建立可跨小说复用的主题术语表。翻译时，所选 ThemeGlossary 会先与小说自身术语表合并，再交给翻译流程使用，以便在同一世界观或同一系列作品中维持译名一致。

涉及文件：

- **后端：** `RouteThemeGlossary.kt`、`ThemeGlossary.kt`、`ThemeGlossaryRepository.kt`，以及 `Application.kt`、`RouteWebNovel.kt`、`RouteWenkuNovel.kt` 中的相关引用
- **前端：** `ThemeGlossaryApi.ts`、`ThemeGlossary.ts`（model）、`GlossaryButton.vue`、`ToolboxItemThemeGlossary.vue`、`TranslateOptions.vue`、`WebNovelWide.vue`、`WebNovelNarrow.vue`、`WebTranslate.vue`
- **数据库：** MongoDB collection `theme-glossary`

> [!NOTE]
> ThemeGlossary 是本 Fork 的新增功能。同步上游更新时，请确认相关代码、模型字段与数据库 collection 仍保留。

### 🌐 域名配置

本 Fork 使用 `books.kotoban.top` 作为生产域名（上游使用 `n.novelia.cc`）。

合并上游代码时，需将以下 hardcoded 域名替换为本 Fork 的域名：

- `web/vite.config.ts` — API proxy target
- `web/src/components/markdown/MarkdownView.vue` — currentHost fallback
- `web/src/util/useUserData/api.ts` — 认证域名注释

Docker image owner 使用 `dekkmarsvin`（而非上游的 `auto-novel`）。

### 📦 其他差异

- 保留 `docker-compose.dev.yml` 用于本地开发测试（上游已删除）
- CI/CD 使用 `${{ github.repository_owner }}` 而非 hardcoded owner

## 与上游同步

本 Fork 采用 **Selective Feature Sync**：上游变更是候选变更，不是自动同步来源。同步时应创建 **Curated Upstream Sync Commit**，只纳入明确接受的上游修复与用户价值，并保留 ThemeGlossary、`books.kotoban.top`、`docker-compose.dev.yml` 等 Fork Capability。

```powershell
# 1. 设置上游远程仓库（若尚未设置）
git remote add upstream https://github.com/auto-novel/auto-novel.git

# 2. 读取最新 Sync Manifest，确认上次评估到的 upstream SHA
Get-ChildItem docs/sync -Filter *.md | Sort-Object Name -Descending | Select-Object -First 1

# 3. 获取上游更新并查看候选提交
git fetch upstream
git log --oneline HEAD..upstream/main

# 4. 在同步分支上手动纳入选定变更
git switch -c sync/upstream-YYYYMMDD
git cherry-pick -n <accepted-upstream-commit>

# 5. 验证 fork invariant 与选择性同步规则
.\scripts\check-selective-feature-sync.ps1
npm run build

# 6. 记录 Sync Manifest 并提交为 fork-authored curated sync commit
New-Item -ItemType Directory -Force docs/sync
Copy-Item docs/sync/TEMPLATE.md docs/sync/YYYY-MM-DD.md
git add docs/sync/YYYY-MM-DD.md
git commit -m "Curated upstream sync: <scope>" -m "Sync-Manifest: docs/sync/YYYY-MM-DD.md"
```

若上游变更较大、逐 commit cherry-pick 难以处理，可以先建立 disposable staging branch 来解冲突与检查最终树，但不可把该 merge commit 合入 `main`：

```powershell
# 1. 读取最新 Sync Manifest，确认上次评估到的 upstream SHA
Get-ChildItem docs/sync -Filter *.md | Sort-Object Name -Descending | Select-Object -First 1

# 2. 建立临时 merge staging branch
git switch -c sync/staging-upstream-YYYYMMDD main
git merge --no-commit --no-ff upstream/main

# 3. 解冲突并验证 fork 行为
.\scripts\check-selective-feature-sync.ps1
npm run build

# 4. 回到 main 建立最终 flat curated commit
git switch -c sync/upstream-YYYYMMDD origin/main
git cherry-pick -m 1 --no-commit sync/staging-upstream-YYYYMMDD
.\scripts\check-selective-feature-sync.ps1
npm run build
New-Item -ItemType Directory -Force docs/sync
Copy-Item docs/sync/TEMPLATE.md docs/sync/YYYY-MM-DD.md
git add docs/sync/YYYY-MM-DD.md
git commit -m "Curated upstream sync: <scope>" -m "Sync-Manifest: docs/sync/YYYY-MM-DD.md"
```

Sync Manifest 至少记录 upstream range、accepted groups、rejected upstream removals、fork adaptations、patch-equivalence notes、next sync starting point、validation commands。若上游删除或改动 Fork Capability，先恢复本 Fork 行为再提交。Legacy Capability（例如 Baidu Translation）可跟随上游移除主动入口，但应尽量保留历史数据可读性。

同步提交在视为 ready 前必须通过 `npm run build`。GitHub Actions 会在 PR 与 `main` push 上执行非发布用途的 build check；`Publish Web` / `Publish Api` 只负责镜像建置与发布。

## 部署

> [!WARNING]
> 注意：本项目并不是为了个人部署设计的，不保证所有功能可用和前向兼容。

```bash
# 1. 克隆仓库
git clone https://github.com/dekkmarsvin/auto-novel.git
cd auto-novel

# 2. 生成环境变量配置
cat > .env << EOF
HTTPS_PROXY=              # web 小说代理，可以为空
PIXIV_COOKIE_PHPSESSID=   # Pixiv Cookie，用于爬取P站小说，可以为空

# 以下字段个人部署不需要填写
ACCESS_TOKEN_SECRET=
MAILGUN_API_KEY=
MAILGUN_API_URL=https://api.eu.mailgun.net/v3/verify.fishhawk.top/messages
MAILGUN_FROM_EMAIL=postmaster@verify.fishhawk.top
EOF

# 3. 启动服务
mkdir -p -m 777 ./data/es/data ./data/es/plugins
docker compose up -d
```

启动后，访问 http://localhost 即可。

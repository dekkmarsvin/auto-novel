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
- `web/src/config.ts`、`web/src/webKit.ts` 与 `apps/admin/vite.config.ts` — 认证使用 `auth.kotoban.top`

Docker image owner 使用 `dekkmarsvin`（而非上游的 `auto-novel`）。

### 📦 其他差异

- 保留 `docker-compose.dev.yml` 用于本地开发测试（上游已删除）
- CI/CD 使用 `${{ github.repository_owner }}` 而非 hardcoded owner

## 与上游同步

本 Fork 采用 **Selective Feature Sync**：上游变更是候选变更，不是自动同步来源。同步时可使用 **Curated Upstream Sync Commit**，或保留 upstream commit 來源的 **Manifested Upstream Cherry-Pick Series**。无论采用哪一种形式，都必须只纳入明确接受的上游修复与用户价值，并保留 ThemeGlossary、`books.kotoban.top`、`docker-compose.dev.yml` 等 Fork Capability。

```powershell
# 1. 设置上游远程仓库（若尚未设置）
git remote add upstream https://github.com/auto-novel/auto-novel.git

# 2. 读取最新 Sync Manifest，确认上次评估到的 upstream SHA
Get-ChildItem docs/sync -Filter *.md | Sort-Object Name -Descending | Select-Object -First 1

# 3. 获取上游更新并查看候选提交
git fetch upstream
git log --oneline HEAD..upstream/main

# 4A. Curated Upstream Sync Commit：不保留 upstream commit 边界，手动纳入选定变更
git switch -c sync/upstream-YYYYMMDD
git cherry-pick -n <accepted-upstream-commit>

# 5A. 记录 Sync Manifest，并与接受的代码变更一起提交
New-Item -ItemType Directory -Force docs/sync
Copy-Item docs/sync/TEMPLATE.md docs/sync/YYYY-MM-DD.md
git add <accepted-files> docs/sync/YYYY-MM-DD.md
git commit -m "Curated upstream sync: <scope>" -m "Sync-Manifest: docs/sync/YYYY-MM-DD.md"

# 6A. 验证 fork invariant、选择性同步规则与完整 build
.\scripts\check-selective-feature-sync.ps1 -BaseRef origin/main -HeadRef HEAD
npm run build

# 4B. Manifested Upstream Cherry-Pick Series：保留 upstream commit 边界与来源
git switch -c sync/upstream-YYYYMMDD
git cherry-pick -x <accepted-upstream-commit>
New-Item -ItemType Directory -Force docs/sync
Copy-Item docs/sync/TEMPLATE.md docs/sync/YYYY-MM-DD.md
git add docs/sync/YYYY-MM-DD.md
git commit -m "Document selective upstream sync" -m "Sync-Manifest: docs/sync/YYYY-MM-DD.md"
.\scripts\check-selective-feature-sync.ps1 -BaseRef origin/main -HeadRef HEAD
npm run build
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

# 4. 回到 main 建立最终 accepted artifact
git switch -c sync/upstream-YYYYMMDD origin/main
git cherry-pick -m 1 --no-commit sync/staging-upstream-YYYYMMDD
New-Item -ItemType Directory -Force docs/sync
Copy-Item docs/sync/TEMPLATE.md docs/sync/YYYY-MM-DD.md
git add <accepted-files> docs/sync/YYYY-MM-DD.md
git commit -m "Curated upstream sync: <scope>" -m "Sync-Manifest: docs/sync/YYYY-MM-DD.md"
.\scripts\check-selective-feature-sync.ps1 -BaseRef origin/main -HeadRef HEAD
npm run build
```

Sync Manifest 至少记录 upstream range、accepted groups、rejected upstream removals、fork adaptations、patch-equivalence notes、next sync starting point、validation commands。若上游删除或改动 Fork Capability，先恢复本 Fork 行为再提交。Baidu Translation 不再属于前端必须保留的历史可读来源；旧设置值会在 migration 中移除，既有数据库字段的清理则另行评估。

任何 fork-adapted upstream sync commit 若不是 `git cherry-pick -x` 产生的直接 upstream commit，commit message 必须包含 `Sync-Manifest: docs/sync/YYYY-MM-DD*.md` trailer。推送前必须运行 `.\scripts\check-selective-feature-sync.ps1 -BaseRef origin/main -HeadRef HEAD`。

同步 PR 可以使用 GitHub 的普通 fork PR merge commit；这种 merge commit 只合并本 fork 的 sync 分支，不等同于 direct upstream merge。不要把 `upstream/main` 的 merge commit 合入 `main`。若使用 squash merge，squash commit 必须保留 `Sync-Manifest:` trailer 或等价的 manifest 证据，否则会丢失选择性同步的审计线索。

同步提交在视为 ready 前必须通过 `npm run build`。GitHub Actions 会在 PR 与 `main` push 上执行非发布用途的 build check；`Publish Web` / `Publish API` / `Publish Server` 负责镜像建置与发布；部署前必须确认同一 SHA 的 Build、Fork Invariants 与所需镜像发布全部成功。

## 部署

Web / Admin 共用 Caddy；`/api/v1/banner` 与 `/api/v1/admin/*` 转发至 Go API，小说与 ThemeGlossary 请求仍转发至 Ktor Server。Go API 使用独立 PostgreSQL 与 R2，既有 MongoDB / Elasticsearch / Redis 数据及挂载不迁移、不删除。

新安装使用 `docker-compose.yml`。先建立私人 `.env`，填写以下配置（已有环境请补字段，不要覆盖原来的秘密）：

```dotenv
HTTPS_PROXY=
# 可选：Go API 的独立代理；不沿用小说爬虫的 HTTPS_PROXY
SHIELD_PROXY_URL=
PIXIV_COOKIE_PHPSESSID=
NAILAIN_PASSWORD=
# 必须与 auth.kotoban.top 的 Auth API 所签发 access token 的秘密一致
ACCESS_TOKEN_SECRET=
POSTGRES_PASSWORD=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
R2_PUBLIC_BASE_URL=
```

R2 S3 凭据仅授予选定 bucket 的对象读写权限。`R2_PUBLIC_BASE_URL` 必须为图片服务的 HTTPS 根地址；不要填写 API 密钥或 S3 写入端点。Bucket CORS 需允许 `https://books.kotoban.top` 发起 `PUT`，并接受 `Content-Type`、`If-None-Match`、`Cache-Control` 请求头。本地管理页面直传时，另外允许实际使用的 localhost 来源。管理端的图片直传使用签名 URL，不向 R2 发送登入 bearer token。

```bash
mkdir -p -m 777 ./data/es/data ./data/es/plugins
docker compose up -d
```

PostgreSQL 首次创建资料目录时会执行唯增的 `sql/init.sql`。已有 PostgreSQL 资料目录请在启动新版 Go API 前执行同一升级脚本；它会在事务内新增缺少的焦点栏位并把既有横幅设为中心焦点，可重复执行。不要删除目录来重新初始化：

```bash
./scripts/apply_db_schema.sh
```

- 用户端：http://localhost:8080/
- 横幅管理：http://localhost:8080/admin/，需同一 Auth 服务的管理员账号。
- Go API 健康检查为 `/health`，会验证 PostgreSQL 与横幅焦点栏位可用。

首页读取已启用的横幅，并依焦点裁剪。每个浏览器选中一张显示两小时后换下一张，列表快取十二小时，因此后台新增、排序或停用不会立刻反映到已快取的浏览器。无可用横幅或 API 暂时失败时保留原本的静态图片；目前首页横幅不提供点击跳转。

新上传图片上限为 500 KiB，可在后台预览 WebP 压缩结果。已保存的横幅可修改焦点、排序、启用状态及链接，但不能原地换图；换图需另外建立横幅。既有较大图片不会因此删除或禁止调整上述设定。图片 key 不重用，使用一年 immutable 快取。回退应用映像时保留新增数据库栏位，不需删除横幅或 R2 物件。

升级旧版时，原 Compose `api`（Ktor）服务改名为 `server`，新的 `api` 是 Go 服务。部署须先保留当前镜像、备份与容器证据，确认 Ktor 的档案挂载、Auth 秘密及 NAILAIN 设置，再协调切换 Web / API / Server；既有资料服务不需重建。不要对生产资料执行 `docker compose down -v`。

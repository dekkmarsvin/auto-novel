# AutoNovel 轻小说机翻机器人（Fork）

[![GPL-3.0](https://img.shields.io/github/license/auto-novel/auto-novel)](https://github.com/auto-novel/auto-novel#license)

> 重建巴别塔！！

本项目是 [auto-novel/auto-novel](https://github.com/auto-novel/auto-novel) 的 Fork 版本。

**站点网址：[https://books.kotoban.top/](https://books.kotoban.top/)**

## Fork 差异

本 Fork 与上游的主要差异如下：

### 🔖 共用主題術語表（ThemeGlossary）

**这是本 Fork 存在的核心理由。** 上游已移除此功能，但本 Fork 持续维护。

ThemeGlossary 允许用户创建、管理和共享跨小说的术语表主题。翻译时，ThemeGlossary 中的术语会与小说自身术语表合并使用，确保同一世界观下的作品翻译一致。

涉及文件：
- **后端：** `RouteThemeGlossary.kt`、`ThemeGlossary.kt`、`ThemeGlossaryRepository.kt`、以及 `Application.kt`、`RouteWebNovel.kt`、`RouteWenkuNovel.kt` 中的相关引用
- **前端：** `ThemeGlossaryApi.ts`、`ThemeGlossary.ts`（model）、`GlossaryButton.vue`、`ToolboxItemThemeGlossary.vue`、`TranslateOptions.vue`、`WebNovelWide.vue`、`WebTranslate.vue`
- **数据库：** MongoDB collection `theme-glossary`

> [!CAUTION]
> **合并上游更新时，务必保留 ThemeGlossary 相关代码。** 上游已删除此功能，合并时可能会意外移除。

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

```bash
# 设置上游远程仓库
git remote add upstream https://github.com/auto-novel/auto-novel.git

# 获取上游更新
git fetch upstream

# 合并（注意解决冲突时保留 ThemeGlossary）
git merge upstream/main
```

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


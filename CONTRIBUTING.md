# 贡献指南

欢迎为本项目贡献！为了确保高效协作，我们有以下建议。

- 如果您计划实现较大的功能或变更，请先通过 Issue 或聊天群联系管理员讨论。
- 请保持 Pull Request 的内容精简，聚焦于一个独立的修改点，以便快速检视和合入。

## 以调试模式启动服务

在仓库根目录执行以下命令，以调试模式启动服务：

```bash
# Elasticsearch 只能以非 root 用户运行，需要配置目录权限
mkdir -p -m 777 ./data/es/data ./data/es/plugins

export COMPOSE_FILE="docker-compose.yml:docker-compose.debug.yml"
docker compose up -d
```

服务启动后，可通过以下地址访问：

- Web：http://localhost:5000
- 小说 API：http://localhost:5000/api
- 横幅管理：http://localhost:5000/admin/
- Go API：http://localhost:5004/v1/banner/
- PostgreSQL：localhost:5005
- MongoDB：localhost:5001
- Elasticsearch：localhost:5002
- Redis：localhost:5003

## 构建工作区包

本项目是一个 monorepo，`web` 依赖 `packages/` 下的工作区包。因此，在启动前端服务器前，需要先在根目录下执行以下命令构建工作区包：

```bash
pnpm install # 安装依赖
pnpm build   # 构建工作区包和前端
```

## 前端开发

基于 Vue 3 / TypeScript / Vite / [Naive UI](https://www.naiveui.com/zh-CN) 构建。

在仓库根目录执行：

```bash
pnpm dev:web   # 构建依赖并启动用户端开发服务器
pnpm dev:admin # 启动管理端开发服务器
pnpm build     # 构建工作区包和前端
```

Web 与 Admin 默认 remote 模式使用 books.kotoban.top / auth.kotoban.top，操作会影响正式资料。`dev:local` 连接本机 Caddy，`dev:native` 连接原生后端（Web 8081、Admin 8080）；这两种模式不连接正式 Auth，开发凭据只发送给同源 `/api/` 代理。原生 Go API 需配置能验证本地开发 token 的测试秘密，不能复用正式秘密。

若需要在手机等设备调试，可添加 `--host` 参数启动服务。

## 后端开发

小说和 ThemeGlossary 后端仍在 `server/`，基于 JVM 17 / Kotlin / Ktor；独立横幅 API 在 `apps/api/`，使用 Go、PostgreSQL 和 R2。Go 的 JWT 角色格式与现有 Auth 一致：HS256、`sub`、`uid`、`role`、`crat`，管理员为 `admin`。

容器构建文件位于 `deploy/`，从仓库根目录建立：

```bash
docker compose -f docker-compose.dev.yml build web api server
```

`docker-compose.dev.yml` 保留为完整本地构建配置；`docker-compose.debug.yml` 则是现成镜像的端口覆盖。PostgreSQL / R2 初始化要求见 README；不需要读取或复制生产资料来执行 `go test ./...` 与 Admin 凭据边界测试。

如果你的修改不涉及 HTTP API，可以使用 Kotest 编写单元测试调试，推荐安装 Kotest 插件。

> [!NOTE]
> NixOS 开发环境配置可以参见 [flake.nix](https://gist.github.com/kurikomoe/9dd60f9613e0b8f75c137779d223da4f)。由于使用了 devenv，因此需要 `--impure`。

# Learning OS

本项目当前提供一个本地优先的 Learning OS MVP，可跑通以下浅闭环：

1. 导入文本内容
2. 生成候选知识点与候选卡片
3. 用户确认入库
4. 查看知识库
5. 进行今日复习
6. 通过关键词搜索已入库知识点

## 当前技术实现

- `apps/console`: React + Vite 用户操作台
- `apps/server`: NestJS 本地服务
- `apps/generator`: FastAPI 规则版候选生成服务
- `apps/shell`: 桌面壳入口与本地进程编排
- `packages/contracts`: Console 与 Server 共享契约定义

说明：

- API 运行时当前使用 Node 24 自带的 `node:sqlite` 将数据持久化到本地 SQLite 文件，默认路径为 `.learning-os/data/learning-os.db`。
- `apps/server/prisma/schema.prisma` 仍然保留，用于描述目标数据结构；当前 MVP 运行时不依赖 Prisma schema engine。

## 安装依赖

说明：

- `.venv/` 是本地 Python 虚拟环境目录，被 `.gitignore` 忽略，不会随仓库一起提交。
- 首次拉取项目后，每位开发者都需要在仓库根目录手动创建一次自己的 `.venv`。

推荐按下面步骤初始化：

```bash
pnpm install
pnpm rebuild electron
python3.11 -m venv .venv
. .venv/bin/activate
python -m pip install -e './apps/generator[dev]'
```

也可以直接使用仓库脚本：

```bash
pnpm run install:python
pnpm run install:js
```

如果希望一次完成全部初始化：

```bash
pnpm run install:all
```

仓库根目录的 `.npmrc` 已默认配置 Electron 镜像下载源：

```ini
electron_mirror=https://npmmirror.com/mirrors/electron/
```

如果你本机网络环境需要临时覆盖，也可以在执行安装前指定：

```bash
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ pnpm rebuild electron
```

如果桌面端启动时提示 `Electron failed to install correctly`，通常是 Electron 二进制下载未完成。请优先执行：

```bash
pnpm rebuild electron
```

## 本地启动

### 配置 DeepSeek

Generator 仅使用 DeepSeek 生成候选知识点和复习卡片。首次启动前，复制 `apps/generator/.env.example` 为同目录 `.env`，并在其中填入 `DEEPSEEK_API_KEY`；`.env` 已被 Git 忽略，不要将真实密钥写入示例文件或提交到仓库。

默认使用 `https://api.deepseek.com` 与 `deepseek-v4-flash`。若缺少密钥或模型调用失败，导入会失败并显示错误，不会退回规则生成。

推荐优先使用仓库根目录的 Turbo 聚合命令：

1. 浏览器完整流程：启动 `console + server + generator`

```bash
pnpm dev
```

2. 等价命令：显式启动 Web 开发链路

```bash
pnpm dev:web
```

3. 桌面完整流程：启动 `console + server + generator + shell`

```bash
pnpm dev:desktop
```

如果只想单独调试某一个服务，也可以使用下面这些命令：

1. 启动 Console

```bash
pnpm dev:console
```

2. 启动 Server

```bash
pnpm dev:server
```

3. 启动 Generator

```bash
pnpm dev:generator
```

4. 启动 Shell

```bash
pnpm dev:shell
```

## macOS 打包

先准备打包所需产物：

```bash
pnpm run build:package
```

生成 macOS 分发包：

```bash
pnpm package:mac
```

当前会产出：

- 目录包：`apps/shell/dist-packages/mac-arm64/Learning OS.app`
- Zip：`apps/shell/dist-packages/Learning OS-0.0.1-arm64.zip`

说明：

- 当前默认不生成 DMG。
- 已在 `macOS 26.5.1` 上验证，系统级 `hdiutil create` 与 `electron-builder` 的 DMG 构建都会失败并返回“只读文件系统”。
- 因此现阶段采用更稳定的 `.app + zip` 方案，详细说明见 [doc/macos-packaging.md](/Users/zhenganlin/Desktop/04-zhen/learning-os/doc/macos-packaging.md)。

生产模式下，Electron 会在应用内置资源中读取：

- 前端静态资源：`console`
- Node 本地服务：`server/dist-prod`
- PyInstaller 二进制：`generator/learning-os-generator`

首次运行时，应用会在 `~/Library/Application Support/Learning OS/` 下创建运行目录与本地数据文件。

## 已验证命令

```bash
pnpm test
pnpm build
pnpm --filter @learning-os/server test
pnpm --filter @learning-os/server build
pnpm --filter @learning-os/console test
pnpm --filter @learning-os/console build
pnpm --filter @learning-os/shell test
pnpm --filter @learning-os/shell build
cd apps/generator && ../../.venv/bin/python -m pytest tests/test_app.py -q
```

## 导入与笔记手动验证

自动单元测试会使用本地替身验证导入流程，不会访问真实网页或调用真实模型；端到端测试不在此说明范围内。完成“配置 DeepSeek”中的环境变量设置后，由用户自行启动 Web 开发链路：

```bash
pnpm dev:web
```

按以下步骤手动验收：

1. 在导入页面分别提交一个公开可访问的 HTTP(S) URL 和一段带标题的 Markdown。
2. 观察每个导入任务从 `processing` 进入 `reviewable`；若抓取或模型调用失败，应进入 `failed` 并显示错误信息。
3. 对失败任务点击“重试”，确认任务重新进入 `processing`，随后进入 `reviewable` 或再次明确失败。
4. 在待审核页面选择候选知识点和复习卡片并确认入库。
5. 在服务端数据目录的 `notes/` 中检查生成的结构化 Markdown：若设置了 `LEARNING_OS_ROOT_DIR`，使用该目录；直接运行 `pnpm dev:web` 时，默认位置为 `apps/server/.learning-os/notes/`。确认文件包含元数据、摘要、核心解释、证据与复习卡片。
6. 打开知识库，确认已入库的知识点和卡片可以正常查看。

## 已验证流程

已通过真实 HTTP 请求与 `apps/e2e` 中的 Playwright 页面流程验证：

- `GET /health`
- `POST /ingestions`
- `GET /ingestions/:sessionId`
- `POST /ingestions/:sessionId/confirm`
- `GET /concepts`
- `GET /review/today`
- `POST /review/:cardId`
- `GET /search?q=React`
- 页面级 `导入 -> 确认入库 -> 知识库查看`
- 页面级 `复习 -> 搜索`

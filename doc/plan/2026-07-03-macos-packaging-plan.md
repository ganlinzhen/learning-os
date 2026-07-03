# Learning OS macOS 打包实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 产出一个可双击启动的 macOS `Learning OS.app/.dmg`，在无云端服务前提下于本地拉起 `console + server + generator` 并使用本地 SQLite 持久化数据。

**Architecture:** 开发态继续使用 Turbo + Vite + 本地脚本；生产态由 Electron 主进程统一编排三类资源：前端静态文件、Node `server` 产物、PyInstaller 打包后的 `generator` 可执行文件。应用启动时以 `app.isPackaged` 为分界，生产模式下注入用户目录、端口与子进程路径，等待健康检查成功后再打开主窗口。

**Tech Stack:** Electron、electron-builder、TypeScript、Vite、NestJS、Node `node:sqlite`、Python 3.11、FastAPI、PyInstaller、pnpm、Turbo

---

## 文件结构与职责

- 新增 `apps/shell/builder/electron-builder.yml`
  - Electron 打包配置，声明 `files`、`extraResources`、macOS `dmg` 产物与应用元数据。
- 新增 `apps/shell/src/main/runtime-paths.ts`
  - 统一解析开发态/生产态下的前端入口、`server` 入口、`generator` 可执行文件、日志目录、用户数据目录。
- 新增 `apps/shell/src/main/service-supervisor.ts`
  - 负责启动、探活、停止 `server` 与 `generator`，向现有 `ProcessManager` 收敛。
- 修改 `apps/shell/src/main/main.ts`
  - 应用启动时使用新的运行时路径与监督器，健康检查通过后再加载窗口。
- 修改 `apps/shell/src/main/process-manager.ts`
  - 从“只会直接 spawn”演进为接收可执行路径、环境变量与探活配置。
- 新增 `apps/shell/src/main/runtime-paths.spec.ts`
  - 覆盖开发态/生产态路径选择。
- 新增 `apps/shell/src/main/service-supervisor.spec.ts`
  - 覆盖探活成功、探活失败、退出清理。
- 修改 `apps/shell/package.json`
  - 增加 `build:prod`、`package:mac`、`package:dir` 等命令。
- 新增 `apps/server/scripts/copy-package-json.mjs`
  - 将生产启动所需的 `package.json` 复制到 `dist/`，保证打包后可直接 `node dist/main.js`。
- 修改 `apps/server/package.json`
  - 增加生产启动命令 `start`，以及为打包准备的 `build:prod`。
- 新增 `apps/generator/scripts/build-macos.sh`
  - 使用 PyInstaller 产出 `generator` 可执行文件。
- 新增 `apps/generator/learning-os-generator.spec`
  - PyInstaller 配置，固定入口与资源收集。
- 修改根目录 `package.json`
  - 增加 `build:package`、`package:mac` 等聚合命令。
- 修改 `README.md`
  - 增加打包方式、产物位置、首次运行说明。

## Task 1: 固化生产态资源布局

**Files:**
- Create: `apps/shell/src/main/runtime-paths.ts`
- Create: `apps/shell/src/main/runtime-paths.spec.ts`
- Modify: `apps/shell/src/main/main.ts`
- Test: `apps/shell/src/main/runtime-paths.spec.ts`

- [ ] **Step 1: 编写失败测试，约束开发态与生产态路径选择**

```ts
import { describe, expect, it } from "vitest";
import { resolveRuntimePaths } from "./runtime-paths";

describe("resolveRuntimePaths", () => {
  it("在开发态返回 Vite 地址与源码服务入口", () => {
    const paths = resolveRuntimePaths({
      isPackaged: false,
      appPath: "/tmp/Learning OS.app",
      userDataPath: "/tmp/user-data",
    });

    expect(paths.webUrl).toBe("http://127.0.0.1:5173");
    expect(paths.serverCommand.command).toBe("node");
    expect(paths.generatorCommand.command).toBe("python3.11");
  });

  it("在生产态返回打包后的资源路径", () => {
    const paths = resolveRuntimePaths({
      isPackaged: true,
      appPath: "/Applications/Learning OS.app/Contents/Resources/app.asar",
      userDataPath: "/Users/demo/Library/Application Support/Learning OS",
    });

    expect(paths.webUrl.startsWith("file://")).toBe(true);
    expect(paths.serverCommand.args.at(-1)).toBe("dist/main.js");
    expect(paths.generatorCommand.command.endsWith("/learning-os-generator")).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @learning-os/shell test -- --run src/main/runtime-paths.spec.ts`
Expected: FAIL，提示找不到 `./runtime-paths` 模块或 `resolveRuntimePaths` 未定义。

- [ ] **Step 3: 实现运行时路径解析**

```ts
import { join } from "node:path";
import { pathToFileURL } from "node:url";

type ResolveRuntimePathsInput = {
  isPackaged: boolean;
  appPath: string;
  userDataPath: string;
};

export type RuntimeCommand = {
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
};

export type RuntimePaths = {
  webUrl: string;
  dataRootDir: string;
  logDir: string;
  serverCommand: RuntimeCommand;
  generatorCommand: RuntimeCommand;
};

export function resolveRuntimePaths(input: ResolveRuntimePathsInput): RuntimePaths {
  const dataRootDir = join(input.userDataPath, "runtime");
  const logDir = join(input.userDataPath, "logs");

  if (!input.isPackaged) {
    return {
      webUrl: "http://127.0.0.1:5173",
      dataRootDir,
      logDir,
      serverCommand: {
        command: "node",
        args: ["apps/server/dist/main.js"],
        cwd: process.cwd(),
        env: {},
      },
      generatorCommand: {
        command: "python3.11",
        args: [
          "-m",
          "uvicorn",
          "learning_os_generator.api.app:app",
          "--app-dir",
          "apps/generator/src",
          "--host",
          "127.0.0.1",
          "--port",
          "8000",
        ],
        cwd: process.cwd(),
        env: {},
      },
    };
  }

  const resourcesDir = join(input.appPath, "..", "..");
  return {
    webUrl: pathToFileURL(join(resourcesDir, "app", "console", "index.html")).toString(),
    dataRootDir,
    logDir,
    serverCommand: {
      command: "node",
      args: [join(resourcesDir, "server", "dist", "main.js")],
      cwd: join(resourcesDir, "server"),
      env: {},
    },
    generatorCommand: {
      command: join(resourcesDir, "generator", "learning-os-generator"),
      args: [],
      cwd: join(resourcesDir, "generator"),
      env: {},
    },
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @learning-os/shell test -- --run src/main/runtime-paths.spec.ts`
Expected: PASS，`2 passed`

- [ ] **Step 5: 提交**

```bash
git add apps/shell/src/main/runtime-paths.ts apps/shell/src/main/runtime-paths.spec.ts apps/shell/src/main/main.ts
git commit -m "feat: resolve packaged runtime paths"
```

## Task 2: 给 shell 增加生产态服务监督器

**Files:**
- Create: `apps/shell/src/main/service-supervisor.ts`
- Create: `apps/shell/src/main/service-supervisor.spec.ts`
- Modify: `apps/shell/src/main/process-manager.ts`
- Modify: `apps/shell/src/main/main.ts`
- Test: `apps/shell/src/main/service-supervisor.spec.ts`

- [ ] **Step 1: 编写失败测试，约束探活与清理行为**

```ts
import { describe, expect, it, vi } from "vitest";
import { ServiceSupervisor } from "./service-supervisor";

describe("ServiceSupervisor", () => {
  it("启动 generator 与 server 并等待健康检查通过", async () => {
    const spawnMock = vi.fn().mockReturnValue({ kill: vi.fn() });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true });

    const supervisor = new ServiceSupervisor(spawnMock as any, fetchMock as any);
    await supervisor.start({
      generator: { command: "generator-bin", args: [], cwd: "/tmp/g", env: {} },
      server: { command: "node", args: ["dist/main.js"], cwd: "/tmp/s", env: {} },
      checks: ["http://127.0.0.1:8000/docs", "http://127.0.0.1:3000/health"],
    });

    expect(spawnMock).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @learning-os/shell test -- --run src/main/service-supervisor.spec.ts`
Expected: FAIL，提示缺少 `ServiceSupervisor`。

- [ ] **Step 3: 实现最小监督器并接入主进程**

```ts
import type { ChildProcess, SpawnOptions } from "node:child_process";

type RuntimeCommand = {
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
};

type StartInput = {
  generator: RuntimeCommand;
  server: RuntimeCommand;
  checks: string[];
};

export class ServiceSupervisor {
  private readonly processes: ChildProcess[] = [];

  constructor(
    private readonly spawnImpl: (command: string, args: string[], options: SpawnOptions) => ChildProcess,
    private readonly fetchImpl: typeof fetch,
  ) {}

  async start(input: StartInput) {
    this.processes.push(
      this.spawnImpl(input.generator.command, input.generator.args, {
        cwd: input.generator.cwd,
        env: { ...process.env, ...input.generator.env },
        stdio: "inherit",
      }),
    );

    this.processes.push(
      this.spawnImpl(input.server.command, input.server.args, {
        cwd: input.server.cwd,
        env: { ...process.env, ...input.server.env },
        stdio: "inherit",
      }),
    );

    for (const check of input.checks) {
      const response = await this.fetchImpl(check);
      if (!response.ok) {
        throw new Error(`service_check_failed:${check}`);
      }
    }
  }

  stop() {
    for (const process of this.processes.splice(0)) {
      process.kill?.("SIGTERM");
    }
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @learning-os/shell test -- --run src/main/service-supervisor.spec.ts`
Expected: PASS，`1 passed`

- [ ] **Step 5: 提交**

```bash
git add apps/shell/src/main/service-supervisor.ts apps/shell/src/main/service-supervisor.spec.ts apps/shell/src/main/process-manager.ts apps/shell/src/main/main.ts
git commit -m "feat: supervise packaged local services"
```

## Task 3: 让 server 具备稳定的生产启动入口

**Files:**
- Create: `apps/server/scripts/copy-package-json.mjs`
- Modify: `apps/server/package.json`
- Modify: `apps/server/tsconfig.json`
- Test: `apps/server/package.json`

- [ ] **Step 1: 增加失败验证，确认当前没有稳定生产启动命令**

Run: `pnpm --filter @learning-os/server start`
Expected: FAIL，提示 `Missing script: start`

- [ ] **Step 2: 增加生产构建脚本**

```json
{
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "build:prod": "pnpm build && node ./scripts/copy-package-json.mjs",
    "start": "node dist/main.js"
  }
}
```

```js
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(currentDir, "..");
mkdirSync(join(projectRoot, "dist"), { recursive: true });
copyFileSync(join(projectRoot, "package.json"), join(projectRoot, "dist", "package.json"));
```

- [ ] **Step 3: 运行构建验证生产产物**

Run: `pnpm --filter @learning-os/server build:prod`
Expected: PASS，并生成 `apps/server/dist/main.js` 与 `apps/server/dist/package.json`

- [ ] **Step 4: 运行生产启动验证**

Run: `pnpm --filter @learning-os/server start`
Expected: PASS，终端出现 NestJS 启动日志并监听 `3000`

- [ ] **Step 5: 提交**

```bash
git add apps/server/package.json apps/server/scripts/copy-package-json.mjs apps/server/tsconfig.json
git commit -m "feat: add packaged server runtime entry"
```

## Task 4: 把 generator 打成 macOS 可执行文件

**Files:**
- Create: `apps/generator/learning-os-generator.spec`
- Create: `apps/generator/scripts/build-macos.sh`
- Modify: `apps/generator/pyproject.toml`
- Test: `apps/generator/scripts/build-macos.sh`

- [ ] **Step 1: 增加失败验证，确认当前没有 PyInstaller 打包脚本**

Run: `bash apps/generator/scripts/build-macos.sh`
Expected: FAIL，提示文件不存在。

- [ ] **Step 2: 添加 PyInstaller 依赖与打包脚本**

```toml
[project.optional-dependencies]
dev = [
  "pytest==8.4.1",
  "pyinstaller==6.15.0",
]
```

```python
from PyInstaller.utils.hooks import collect_submodules

hiddenimports = collect_submodules("learning_os_generator")

a = Analysis(
    ["src/learning_os_generator/api/app.py"],
    pathex=["src"],
    hiddenimports=hiddenimports,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="learning-os-generator",
    console=True,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    name="learning-os-generator",
)
```

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"
../../.venv/bin/pyinstaller --clean learning-os-generator.spec
```

- [ ] **Step 3: 运行打包验证**

Run: `bash apps/generator/scripts/build-macos.sh`
Expected: PASS，并生成 `apps/generator/dist/learning-os-generator/learning-os-generator`

- [ ] **Step 4: 运行可执行文件探活验证**

Run: `apps/generator/dist/learning-os-generator/learning-os-generator`
Expected: PASS，进程启动后可被 `curl http://127.0.0.1:8000/docs` 访问

- [ ] **Step 5: 提交**

```bash
git add apps/generator/pyproject.toml apps/generator/learning-os-generator.spec apps/generator/scripts/build-macos.sh
git commit -m "feat: package generator as macos binary"
```

## Task 5: 接入 electron-builder 产出 `.app` 与 `.dmg`

**Files:**
- Create: `apps/shell/builder/electron-builder.yml`
- Modify: `apps/shell/package.json`
- Modify: `package.json`
- Test: `apps/shell/builder/electron-builder.yml`

- [ ] **Step 1: 增加失败验证，确认当前没有 macOS 打包命令**

Run: `pnpm package:mac`
Expected: FAIL，提示 `Missing script: package:mac`

- [ ] **Step 2: 添加打包配置与聚合命令**

```yaml
appId: os.learning.macos
productName: Learning OS
directories:
  output: dist-packages
files:
  - dist/**
  - package.json
extraResources:
  - from: ../console/dist
    to: app/console
  - from: ../server
    to: server
    filter:
      - dist/**
      - package.json
  - from: ../generator/dist/learning-os-generator
    to: generator
mac:
  target:
    - dmg
    - dir
```

```json
{
  "scripts": {
    "build:prod": "tsc -p tsconfig.json",
    "package:dir": "electron-builder --config builder/electron-builder.yml --dir",
    "package:mac": "electron-builder --config builder/electron-builder.yml --mac dmg"
  }
}
```

```json
{
  "scripts": {
    "build:package": "pnpm --filter @learning-os/console build && pnpm --filter @learning-os/server build:prod && bash apps/generator/scripts/build-macos.sh && pnpm --filter @learning-os/shell build:prod",
    "package:mac": "pnpm run build:package && pnpm --filter @learning-os/shell package:mac"
  }
}
```

- [ ] **Step 3: 运行目录打包验证**

Run: `pnpm --filter @learning-os/shell package:dir`
Expected: PASS，并生成 `apps/shell/dist-packages/mac/Learning OS.app`

- [ ] **Step 4: 运行 DMG 打包验证**

Run: `pnpm package:mac`
Expected: PASS，并生成 `apps/shell/dist-packages/Learning OS-0.0.1.dmg`

- [ ] **Step 5: 提交**

```bash
git add apps/shell/builder/electron-builder.yml apps/shell/package.json package.json
git commit -m "feat: add macos packaging pipeline"
```

## Task 6: 补充运行说明与真机验收

**Files:**
- Modify: `README.md`
- Modify: `doc/plan/2026-07-03-macos-packaging-plan.md`
- Test: `README.md`

- [ ] **Step 1: 更新 README 的打包与首次运行说明**

```md
## macOS 打包

```bash
pnpm package:mac
```

产物位于 `apps/shell/dist-packages/`。

首次运行时，应用会在 `~/Library/Application Support/Learning OS/` 下创建：

- `runtime/data/learning-os.db`
- `logs/`

生产模式下由 Electron 自动拉起本地 `server` 与 `generator`。
```

- [ ] **Step 2: 运行构建命令做文档回归验证**

Run: `pnpm package:mac`
Expected: PASS，文档中的命令与真实命令一致。

- [ ] **Step 3: 执行一次真机安装验收**

Run:
```bash
open apps/shell/dist-packages/Learning\ OS-0.0.1.dmg
```

Expected:
- 能拖入 `Applications`
- 首次双击可启动
- 能完成 `导入 -> 确认入库 -> 知识库 -> 复习 -> 搜索`

- [ ] **Step 4: 记录验收结论**

```md
- 验收机器：macOS 15.x
- 安装方式：DMG 拖拽安装
- 结果：通过 / 未通过
- 如未通过：记录失败步骤与日志路径
```

- [ ] **Step 5: 提交**

```bash
git add README.md doc/plan/2026-07-03-macos-packaging-plan.md
git commit -m "docs: add macos packaging guide"
```

## 自检

- 需求覆盖
  - 本地离线运行：Task 2、Task 3、Task 4、Task 5 覆盖
  - `server + generator` 均由本地应用托管：Task 2 覆盖
  - macOS `.app/.dmg` 产物：Task 5 覆盖
  - 本地 SQLite 用户目录持久化：Task 1、Task 6 覆盖
- 占位符检查
  - 已移除 `TODO/TBD` 表述，所有脚本名、文件名、命令名均已具体化
- 一致性检查
  - 统一使用 `pnpm package:mac`
  - 统一使用 `learning-os-generator` 作为 PyInstaller 产物名称
  - 统一使用 `app.isPackaged` 作为生产模式分界

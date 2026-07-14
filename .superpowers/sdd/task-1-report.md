# Task 1 实施报告：扩展契约与 SQLite 操作层

## 改动

- 在共享契约中新增 `AgentTaskDto`，并将 `IngestionDetailDto.task` 设为必填；`CreateImportDto` 的 `title`、`content`、`url` 均为可选。
- 在 Prisma schema 中新增 `AgentTask`，并为 `Note` 增加可选 `localPath`。
- 运行时 SQLite 新增 `agent_tasks` 表；启动时通过 `pragma table_info(notes)` 检测并安全执行 `alter table notes add column local_path text`。
- 扩展 `PrismaService`：`agentTask.create/update/findUnique`、`source.update`、`conceptCandidate.deleteMany`、`note.create` 和带回滚、重抛行为的 `transaction`。
- 所有现有 `create` facade 及卡片批量创建均支持调用方提供 `id`，否则使用 `randomUUID()`。
- 增加隔离临时 SQLite 测试，覆盖失败任务读取、旧版 notes 升级及事务回滚。

## RED / GREEN 证据

### RED

1. 在 `ingestion.spec.ts` 先加入带 `task` 的失败导入详情用例后，执行指定命令：

   ```bash
   rtk pnpm --filter @learning-os/contracts test -- ingestion.spec.ts
   ```

   该 Vitest 运行器不执行 TypeScript 类型检查，因此新增用例本身被运行时对象直接满足；命令整体则因既有 `src/index.spec.ts` 导入 CommonJS `src/ingestion.js` 的 ESM 错误失败。该错误与本任务无关，开始修改前即存在。

2. 为确认题设要求的类型 RED，补充执行：

   ```bash
   rtk pnpm --filter @learning-os/contracts lint
   ```

   获得预期错误：`task does not exist in type 'IngestionDetailDto'` 与 `Property 'task' does not exist on type 'IngestionDetailDto'`。

3. 在 `prisma.service.spec.ts` 先加入临时数据库的失败任务创建/读取用例后，执行：

   ```bash
   rtk pnpm --filter @learning-os/server test -- prisma.service.spec.ts
   ```

   获得预期错误：`Cannot read properties of undefined (reading 'create')`，即 `agentTask` facade 尚未实现。

### GREEN

- `rtk pnpm --filter @learning-os/contracts lint`：通过。
- `rtk pnpm --filter @learning-os/contracts exec vitest run src/ingestion.spec.ts`：2/2 通过。
- `rtk pnpm --filter @learning-os/server test -- prisma.service.spec.ts`：9 个测试文件、12 个测试全部通过；其中持久化测试文件 4/4 通过。
- `rtk pnpm --filter @learning-os/server exec prisma validate`：schema 校验通过。

## 文件列表

- `packages/contracts/src/ingestion.ts`
- `packages/contracts/src/ingestion.spec.ts`
- `apps/server/prisma/schema.prisma`
- `apps/server/src/infrastructure/persistence/prisma.service.ts`
- `apps/server/src/infrastructure/persistence/prisma.service.spec.ts`
- `.superpowers/sdd/task-1-report.md`（本报告，按任务要求新增）

未修改 `apps/shell/.preload-build/`。

## 自审

- `agent_tasks` 包含要求的所有列，日期字段以 ISO 文本存储并在 facade 中映射。
- 旧库 notes 升级和新库建表都含 `local_path`，迁移测试不依赖真实用户数据。
- `transaction` 在回调抛错时执行 `ROLLBACK`，保留并重新抛出原始异常；测试验证回滚后 session 不可读取。
- `conceptCandidate.deleteMany` 对空 `id.in` 返回零，不会误删整批候选项。
- 执行 `git diff --check`，无空白错误；仅暂存任务指定的五个代码文件。

## 顾虑

1. 题设要求 `IngestionDetailDto.task` 必填，但允许修改的五个文件不含 `apps/server/src/modules/ingestion/ingestion.service.ts`。该 service 的 `getIngestionDetail()` 仍未返回 `task`，因此 `rtk pnpm --filter @learning-os/server lint` 报 TS2741。修复需超出简报范围地修改该 service；已向主代理报告，未擅自越界。
2. 指定 contracts 测试命令会被既有 `src/index.spec.ts` 的 ESM/CJS 构建遗留物失败；目标 `ingestion.spec.ts` 通过，且 contracts 类型检查通过。未修改任务范围外的既有构建产物或测试配置。

---

# Task 1 已授权补充：导入详情任务映射

## 改动

- `IngestionService.getIngestionDetail()` 现在读取 `session.latestAgentTaskId`，并通过 `prisma.agentTask.findUnique` 获取真实任务。
- 真实任务存在时，返回任务 `id`、`status`、`attemptCount`、`lastErrorCode`、`lastErrorMessage`；仅在会话和任务均为 `failed` 时设置 `canRetry: true`。
- 旧会话没有任务时返回兼容任务摘要：根据会话状态映射任务状态、尝试次数为 `0` 且始终 `canRetry: false`，不伪造可重试状态。
- 在 `ingestion.service.spec.ts` 增加真实失败任务映射和旧会话兼容摘要两项服务级测试。

## RED / GREEN 证据

### RED

先只加入服务测试后执行：

```bash
rtk pnpm --filter @learning-os/server test -- ingestion.service.spec.ts
```

结果：失败，新增两项测试分别显示 `agentTask.findUnique` 调用次数为 `0`，以及返回的 `result.task` 为 `undefined`。这确认缺口是服务尚未查询或返回任务映射。

### GREEN

完成最小映射后执行：

```bash
rtk pnpm --filter @learning-os/server test -- ingestion.service.spec.ts
rtk pnpm --filter @learning-os/server lint
```

结果：Vitest 9 个测试文件、14 个测试全部通过；`tsc --noEmit -p tsconfig.json` 通过。

## 范围与顾虑

- 未实现重试接口、前端或 URL 抓取，未修改 `apps/shell/.preload-build/`，也未改动 Task 1 的持久化实现。
- 兼容摘要的 `id` 使用 `legacy:<sessionId>`，用于满足必填 DTO 并明确其并非真实持久化任务；其 `canRetry` 固定为 `false`。

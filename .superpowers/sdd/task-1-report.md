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

---

# Task 1 审查修复：测试文案汉化

## 修复

- 将新增的持久化、导入服务和导入契约测试用例标题统一改为简体中文；未改变测试逻辑、断言或其他既有用例文案。
- 未修改 `apps/shell/.preload-build/`。

## 验证

```bash
rtk pnpm --filter @learning-os/server test -- prisma.service.spec.ts ingestion.service.spec.ts
rtk pnpm --filter @learning-os/contracts exec vitest run src/ingestion.spec.ts
```

结果：服务端 9 个测试文件、14 项测试均通过；契约 `src/ingestion.spec.ts` 2 项测试均通过。

## 顾虑

- 无新增顾虑；工作区中其余未提交改动未纳入本次提交。

---

# Task 1 重审修复：事务隔离与同步导入输入校验

## 修复

- `PrismaService.transaction()` 现在为每个事务创建并初始化独立的 `PrismaService` 连接，在该连接上执行 `BEGIN IMMEDIATE`，仅将该事务客户端交给回调；提交或回滚后在 `finally` 中关闭客户端连接。共享服务连接不再进入事务。
- `IngestionService.createImport()` 在入口处仅接受 `text`：`title` 与 `content` 必须是去除空白后仍非空的字符串；`url`、`markdown` 等未实现类型直接返回 `BadRequestException`，不会再把不完整输入传给存储层。

## RED / GREEN 证据

### RED

先新增并发事务测试和两个导入服务校验测试，执行：

```bash
rtk pnpm --filter @learning-os/server test -- prisma.service.spec.ts ingestion.service.spec.ts
```

结果：3 项新增测试失败。共享连接的事务在回滚后使事务外已成功创建的会话查询为 `null`；缺正文和 URL 输入则在后续流程触发 `TypeError`，而非 `BadRequestException`。

### GREEN

完成最小修复后执行：

```bash
rtk pnpm --filter @learning-os/server test -- prisma.service.spec.ts ingestion.service.spec.ts
rtk pnpm --filter @learning-os/server lint
rtk git diff --check
```

结果：9 个测试文件、17 项测试全部通过；`tsc --noEmit -p tsconfig.json` 通过；差异检查无空白错误。

## 覆盖范围

- 并发测试在事务内写入并暂停时，尝试使用原服务连接写入：若写入成功，事务回滚后该会话仍必须存在；若 SQLite 写锁阻止写入，则断言该写入没有成功返回。
- 原有事务失败用例继续验证事务客户端中创建的会话在回滚后不可见。
- 服务测试覆盖缺少文本正文与 URL 导入均返回业务异常；实现同样拒绝尚未实现的 markdown 类型。

## 约束与顾虑

- 未修改 `apps/shell/.preload-build/`，未实现 URL 抓取、重试 API 或前端。
- 未发现本修复范围内的额外顾虑；事务客户端复用现有幂等建表和 notes 列升级逻辑，并在每次事务结束时关闭。

---

# Task 1 最终复核修复：来源空路径语义

## 修复

- `source.update()` 对 `localPath` 采用与 `url` 一致的三态语义：字段为 `undefined` 时保留当前值，字段显式为 `null` 时写入 SQL `NULL`。
- `mapSource()` 将 SQL `NULL` 映射为 `undefined`，避免向调用方返回字符串 `"null"`。

## RED / GREEN 证据

### RED

新增“保留已有 NULL”与“显式清空路径”两个回归用例后执行：

```bash
rtk pnpm --filter @learning-os/server test -- prisma.service.spec.ts
```

结果：新增两项测试失败，分别收到 `"null"` 与原有路径 `/tmp/source.txt`，准确复现缺陷。

### GREEN

完成最小修复后执行：

```bash
rtk pnpm --filter @learning-os/server test -- prisma.service.spec.ts
rtk pnpm --filter @learning-os/server lint
rtk git diff --check
```

结果：服务端 9 个测试文件、19 项测试全部通过；`tsc --noEmit -p tsconfig.json` 通过；差异检查无空白错误。

## 约束与顾虑

- 回归测试直接断言 SQLite 中的 `local_path` 为 SQL `NULL`，并模拟可为空的既有来源记录。
- 现有新库 DDL 仍将 `sources.local_path` 定义为 `NOT NULL`；本修复保证 `source.update()` 对可为空记录按三态绑定值。若需让新建数据库也接受显式清空，需另行调整该既有表约束及迁移，超出本次限定的 update 语义修复范围。
- 未修改 `apps/shell/.preload-build/`，也未改变其他字段或 preload 行为。

---

# Task 1 验收修复：来源路径约束与任务会话关联

## 改动

- `PrismaService.source.update()` 现在仅在 `localPath` 为 `undefined` 时保留原值；传入非空字符串时更新路径；传入 `null`、空字符串或非字符串值时，在执行 SQL 前抛出稳定错误 `source_local_path_required`。
- `mapSource()` 使用 `row.local_path == null` 判断 SQL NULL，因此仅 NULL 映射为 `undefined`，空字符串会被如实映射为 `""`。
- `IngestionService.createImport()` 保持先创建 `AgentTask` 再创建会话的顺序；会话创建后立即通过 `agentTask.update()` 回填 `sessionId`，后续仍单独更新任务状态。
- 持久化测试不再构造可空的旧版 `sources` 表来证明清空路径；改为由真实 `PrismaService` 初始化的数据库验证 `null` 和空字符串均被业务错误拒绝。

## RED / GREEN 证据

### RED

先仅增加回归用例后执行：

```bash
rtk pnpm --filter @learning-os/server test -- prisma.service.spec.ts ingestion.service.spec.ts
```

结果：4 项新增用例失败，分别确认：

- `localPath: null` 抛出了 SQLite 的 `NOT NULL constraint failed`，而不是稳定业务错误；
- `localPath: ""` 被错误地接受；
- `mapSource()` 将空字符串错误映射为 `undefined`；
- 导入任务的首次 `agentTask.update()` 仅写入 `status: "succeeded"`，未回填 `sessionId`。

### GREEN

实现最小修复后执行：

```bash
rtk pnpm --filter @learning-os/server test -- prisma.service.spec.ts ingestion.service.spec.ts
rtk pnpm --filter @learning-os/server lint
```

结果：服务端 9 个测试文件、21 项测试全部通过；`tsc --noEmit -p tsconfig.json` 通过。

## 约束与顾虑

- 未修改 schema；`sources.local_path` 仍为必填字段。
- 不再宣称或测试可由真实 schema 创建的 NULL 来源记录可被写回；仍通过映射测试保证 SQL NULL 不会被字符串化，且空字符串不会丢失。
- 未实现 URL、Markdown 或重试逻辑，未修改 preload。

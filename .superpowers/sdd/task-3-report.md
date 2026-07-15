# Task 3 实施报告：异步导入任务与用户手动重试

## 结果

- `createImport` 支持 text、url、markdown，先持久化原始 Source、processing 会话和 attemptCount=1 的 pending AgentTask，再用 `queueMicrotask` 调度后台任务并立即返回 processing。
- 后台任务统一通过 `StorageService.resolveImportContent` 解析来源、保存最终正文，随后生成候选并将任务/会话推进到 succeeded/reviewable。
- 解析或生成失败统一落盘稳定错误码和简体中文消息；调度入口和任务内部均收敛 Promise rejection，不自动重试。
- 仅 failed 会话且 latest AgentTask 真实为 failed 时允许手动重试；尝试次数递增、错误和时间清空，URL 重新抓取，text/markdown 复用持久化正文。
- 新增 `POST /ingestions/:sessionId/retry`，详情接口继续在 processing、failed、reviewable 状态返回任务摘要与 canRetry。
- 重试成功写入新候选前，按会话先删除旧卡片候选，再删除旧概念候选，避免 SQLite 中残留孤立卡片记录。

## TDD 证据

### 第一轮 RED

命令：

```bash
rtk pnpm --filter @learning-os/server test -- ingestion.service.spec.ts retry-ingestion.spec.ts confirm-ingestion.spec.ts
```

结果：8 个预期失败、32 个通过。

- 旧 `createImport` 等待永不 resolve 的 generator，测试超时，证明尚未立即返回 processing。
- URL、Markdown 分别被旧入口拒绝。
- `runImportTask` 三项因方法不存在失败。
- `retryIngestion` 两项因方法不存在失败。

### 第一轮 GREEN

同一命令结果：12 个测试文件全部通过，40/40 测试通过。

### 自审补强 RED / GREEN

1. 完整清理卡片候选和 retry 路由元数据：新增测试后出现 3 个预期失败（未调用卡片清理、持久化层缺少 `cardCandidate.deleteMany`、控制器缺少 retry 方法）；最小实现后 42/42 通过。
2. 无显式标题的 URL/Markdown 不应把占位标题误当显式标题：新增断言后 2 个预期失败；将初始 Source 标题改为空字符串后通过，后台解析可采用网页标题或 Markdown 一级标题。

## 最终验证

```bash
rtk git diff --check
rtk pnpm --filter @learning-os/server test -- ingestion.service.spec.ts retry-ingestion.spec.ts confirm-ingestion.spec.ts
rtk pnpm --filter @learning-os/server lint
```

结果：

- `git diff --check`：通过，无空白错误。
- 测试：12 个测试文件通过，42/42 测试通过。
- server lint / TypeScript 检查：通过，退出码 0。

## 修改文件

- `apps/server/src/modules/ingestion/ingestion.service.ts`
- `apps/server/src/modules/ingestion/ingestion.service.spec.ts`
- `apps/server/src/modules/ingestion/retry-ingestion.spec.ts`
- `apps/server/src/modules/ingestion/ingestion.controller.ts`
- `apps/server/src/modules/ingestion/dto/create-import.dto.ts`
- `apps/server/src/infrastructure/persistence/prisma.service.ts`
- `apps/server/src/infrastructure/persistence/prisma.service.spec.ts`
- `.superpowers/sdd/task-3-report.md`

## 自审

- 逐条对照 Task 3 七项必须行为，未实现结构化笔记、确认流程扩展或前端功能。
- `queueMicrotask` 回调显式捕获 `runImportTask` rejection；`runImportTask` 失败分支自身也吞并错误落盘失败，避免二次未捕获 rejection。
- 重试前同时校验会话与真实 latest task 都为 failed；reviewable 等其他状态使用指定中文业务错误。
- 候选删除发生在生成器成功返回后、新候选写入前；卡片先删、概念后删，避免外键置空产生孤立数据。
- 未触碰 `apps/shell/.preload-build/`；工作区中该目录原有删除状态未纳入提交。
- 尝试按 `superpowers:requesting-code-review` 派发只读独立审查，但团队并发槽已满，未能启动；已用需求清单、差异检查和最终测试自行复核。

## 顾虑

- `queueMicrotask` 是进程内调度；若服务在微任务执行前退出，pending/running 任务不会自动恢复。当前需求明确禁止自动重试，因此本任务未增加启动恢复机制。
- 候选替换由多次 SQLite 写入组成而非单一事务；中途写入失败时会落为 failed，用户手动重试会再次清理并重建候选。若后续要求强原子性，应单独设计事务边界。

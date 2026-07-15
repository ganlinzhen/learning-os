# Task 4 实施报告：结构化笔记数据库与 Markdown 双写

## 结果

已实现确认导入时的结构化笔记双写：先批量原子写入 `notes/*.md`，再通过 `PrismaService.transaction` 提供的独立 `tx` facade 在单个 SQLite 事务内创建 Concept、选中 ReviewCard、Note，并最终更新导入会话状态。文件写入失败不会启动事务；事务失败会删除本批次已生成的笔记。

## RED

先修改测试，未修改生产代码前运行：

```bash
rtk pnpm --filter @learning-os/server test -- storage.service.spec.ts confirm-ingestion.spec.ts
```

结果：退出码 1；2 个测试文件失败、10 个测试失败、48 个测试通过。

失败原因符合预期：

- `StorageService.writeNotes` 与 `removeFiles` 尚不存在。
- 旧 `confirmIngestion` 未读取并校验会话状态。
- 旧确认流程直接写数据库，未执行文件先写、事务提交和失败补偿。
- 旧选卡逻辑会将显式空 `selectedCardIds` 错误回退为候选默认选中卡片。
- 旧流程不会拒绝重复确认或不属于当前会话的候选。

RED 新增覆盖：

- Markdown YAML、章节顺序、卡片内容和安全稳定路径。
- 成功或失败后不遗留随机 `.tmp`。
- 批量写入中途失败时清理此前已落盘文件。
- `removeFiles` 忽略不存在文件并抛出其他错误。
- 文件失败不启动事务。
- 成功时文件与 Concept、ReviewCard、Note 双写，并仅使用事务 `tx`。
- 事务失败删除已写 Markdown 并重新抛出。
- `processing`、`imported` 状态拒绝确认。
- 候选归属验证，以及 `selectedCardIds` 显式空列表过滤。

## GREEN

最小实现后运行同一测试命令：

```bash
rtk pnpm --filter @learning-os/server test -- storage.service.spec.ts confirm-ingestion.spec.ts
```

结果：退出码 0；12 个测试文件、58 个测试全部通过。

首次运行 lint 时发现 3 个 `TS7031` 隐式 `any`：候选查询由当前宽类型 persistence facade 返回，导致后续中间结构映射失去类型推断。为 `imports` 补充最小显式类型后重新验证：

```bash
rtk pnpm --filter @learning-os/server lint
rtk pnpm --filter @learning-os/server test -- storage.service.spec.ts confirm-ingestion.spec.ts
```

结果：两条命令均退出码 0；lint 无错误，测试仍为 12 个测试文件、58 个测试全部通过。

## 修改文件

- `apps/server/src/infrastructure/storage/storage.service.ts`
  - 新增 `writeNotes`、`removeFiles`、Markdown 构建和安全文件名逻辑。
  - 每个文件先写同目录随机 `.tmp`，再 `rename` 到最终 `.md`。
  - 批量失败时清理本批次已经写入的最终文件。
- `apps/server/src/infrastructure/storage/storage.service.spec.ts`
  - 新增 Markdown 结构、路径、临时文件、批量失败和删除语义测试。
- `apps/server/src/modules/ingestion/ingestion.service.ts`
  - 确认前校验 `reviewable` 会话和候选归属。
  - 预分配 conceptId、过滤选中卡片并先写笔记。
  - 所有数据库写入均在事务回调内通过 `tx` facade 完成。
  - 事务失败时删除本次笔记并重新抛出。
- `apps/server/src/modules/ingestion/confirm-ingestion.spec.ts`
  - 覆盖成功双写、筛卡、文件失败、事务失败、状态和归属校验。

未修改 persistence facade、前端与 `apps/shell/.preload-build/`。工作区中该目录原有的删除状态未被本任务触碰，也不会纳入本任务提交。

## 自审

- 逐条核对 Task 4 简报的 8 项接口与行为，均有实现和对应测试。
- 确认 `confirmIngestion` 在事务开始前只做读取和文件写入；Concept、ReviewCard、Note 与会话更新均使用回调参数 `tx`，没有误用外层 PrismaService 连接。
- 确认文件写入失败路径不会调用 `prisma.transaction`。
- 确认事务失败清理路径只包含本批次 `writeNotes` 返回的文件。
- 确认显式 `selectedCardIds: []` 代表不选择任何卡片，而仅在未提供字段时回退 `card.isSelected`。
- 确认 `git diff --check` 通过，Task 4 仅涉及简报允许的 4 个源码/测试文件及本报告。
- 尝试按流程启动独立只读审查代理，但当前线程名额已满；主代理已明确会在提交后统一审查，本报告记录的是实现者自审结果。

## 顾虑与边界

- 文件系统与 SQLite 无法组成同一个原生事务，本任务按简报采用“文件先写 + 数据库事务 + 失败删除文件”的补偿策略。若底层文件删除本身发生非 `ENOENT` 错误，`removeFiles` 会显式抛出，可能需要人工清理残留文件；不会静默忽略。
- 当前持久层对候选记录使用宽类型，Task 4 仅为本地中间结构补充最小类型，没有在本任务范围外重构 persistence facade。

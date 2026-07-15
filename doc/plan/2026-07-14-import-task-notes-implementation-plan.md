# URL / Markdown 导入、任务重试与结构化笔记 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 支持自动抓取网页的 URL 与 Markdown 导入、持久化任务状态和用户手动重试，并在确认入库时保存结构化本地 Markdown 笔记。

**Architecture:** 创建导入后，NestJS 立即保存 Source、会话和 `AgentTask` 并异步运行任务；URL 会先抓取并提取静态 HTML 正文，三种来源复用候选生成链路。确认入库时先原子写入 Markdown 文件，再用一个 SQLite 事务写入知识点、卡片、笔记和会话状态。

**Tech Stack:** React 19、NestJS 11、TypeScript、Node 24 `fetch`/`node:sqlite`、Vitest、Testing Library。

## Global Constraints

- 所有新增内容使用简体中文。
- 不新增网页抓取依赖，仅使用 Node 内置 `fetch`；只处理公开静态 HTML，拒绝非 HTTP(S) URL。
- 不实现自动重试、登录/反爬绕过、JS 渲染网页、PDF/图片抓取与 Markdown 反向同步。
- 笔记保存到应用根目录下的 `notes/`；运行时 SQLite 仍位于 `.learning-os/data/learning-os.db`。
- 不启动 dev server、浏览器或 Electron 进行验证；只提供手动验证说明。
- 不将用户已有的 `apps/shell/.preload-build/preload/preload.cjs` 未暂存删除纳入提交，也不恢复该文件。

---

## 文件结构

| 文件 | 职责 |
| --- | --- |
| `packages/contracts/src/ingestion.ts` | 导入输入、任务摘要和详情共享类型。 |
| `apps/server/src/infrastructure/web/web-content.service.ts` | URL 校验、下载 HTML、提取标题和正文。 |
| `apps/server/src/infrastructure/persistence/prisma.service.ts` | SQLite 任务表、笔记路径列、操作 facade 与事务。 |
| `apps/server/src/infrastructure/storage/storage.service.ts` | 保存来源和结构化笔记文件、清理失败文件。 |
| `apps/server/src/modules/ingestion/ingestion.service.ts` | 异步导入、状态机、重试、确认入库。 |
| `apps/console/src/features/ingestion/*.tsx` | 多来源提交、任务刷新、失败重试。 |

### Task 1: 扩展契约与 SQLite 操作层

**Files:**

- Modify: `packages/contracts/src/ingestion.ts`
- Test: `packages/contracts/src/ingestion.spec.ts`
- Modify: `apps/server/prisma/schema.prisma`
- Modify: `apps/server/src/infrastructure/persistence/prisma.service.ts`
- Test: `apps/server/src/infrastructure/persistence/prisma.service.spec.ts`

**Interfaces:**

- Produces: `AgentTaskDto`、扩展后的 `CreateImportDto` 与 `IngestionDetailDto.task`。
- Produces: `agentTask.create/update/findUnique`、`source.update`、`conceptCandidate.deleteMany`、`note.create`、`transaction<T>(work)`。

- [ ] **Step 1: 写任务摘要的失败契约测试**

```ts
it("exposes a retryable failed task", () => {
  const detail: IngestionDetailDto = {
    sessionId: "s1", sourceId: "src1", title: "标题", sourceType: "url", status: "failed",
    task: { id: "t1", status: "failed", attemptCount: 2, lastErrorCode: "web_fetch_failed", lastErrorMessage: "无法访问网页", canRetry: true },
    coreConcepts: [], candidateConcepts: [],
  };
  expect(detail.task.canRetry).toBe(true);
});
```

- [ ] **Step 2: 验证测试为红色**

Run: `rtk pnpm --filter @learning-os/contracts test -- ingestion.spec.ts`

Expected: FAIL，`IngestionDetailDto` 尚无 `task`。

- [ ] **Step 3: 实现共享类型与运行时表升级**

在契约中加入：

```ts
export interface AgentTaskDto {
  id: string;
  status: "pending" | "running" | "succeeded" | "failed";
  attemptCount: number;
  lastErrorCode?: string;
  lastErrorMessage?: string;
  canRetry: boolean;
}

export interface CreateImportDto {
  type: "text" | "url" | "markdown";
  title?: string;
  content?: string;
  url?: string;
}
```

在运行时创建 `agent_tasks(id, session_id, type, status, attempt_count, last_error_code, last_error_message, started_at, finished_at, created_at, updated_at)`；为已有 `notes` 表用 `pragma_table_info` 检测并添加 `local_path text`。创建 `agentTask` facade，所有创建操作支持 `data.id ?? randomUUID()`，并暴露 `transaction`，在回调异常时执行 `ROLLBACK`。

- [ ] **Step 4: 为持久化任务写失败测试并实现**

```ts
it("persists failed task metadata", async () => {
  const task = await prisma.agentTask.create({ data: {
    sessionId: "s1", type: "ingestion_generation", status: "failed", attemptCount: 1,
    lastErrorCode: "web_fetch_failed", lastErrorMessage: "无法访问网页",
  }});
  await expect(prisma.agentTask.findUnique({ where: { id: task.id } })).resolves.toMatchObject({
    status: "failed", attemptCount: 1, lastErrorCode: "web_fetch_failed",
  });
});
```

- [ ] **Step 5: 运行测试并提交**

Run: `rtk pnpm --filter @learning-os/contracts test -- ingestion.spec.ts && rtk pnpm --filter @learning-os/server test -- prisma.service.spec.ts`

Expected: exit code 0。

```bash
rtk git add packages/contracts/src/ingestion.ts packages/contracts/src/ingestion.spec.ts apps/server/prisma/schema.prisma apps/server/src/infrastructure/persistence/prisma.service.ts apps/server/src/infrastructure/persistence/prisma.service.spec.ts
rtk git commit -m "feat: 持久化导入任务状态"
```

### Task 2: 实现网页抓取与 Markdown 来源解析

**Files:**

- Create: `apps/server/src/infrastructure/web/web-content.service.ts`
- Create: `apps/server/src/infrastructure/web/web-content.service.spec.ts`
- Modify: `apps/server/src/infrastructure/storage/storage.service.ts`
- Modify: `apps/server/src/infrastructure/storage/storage.service.spec.ts`
- Modify: `apps/server/src/modules/ingestion/ingestion.module.ts`

**Interfaces:**

- Produces: `WebContentService.fetch(url): Promise<{ title: string; content: string }>`。
- Produces: `StorageService.resolveImportContent(input): Promise<{ title: string; content: string; url?: string }>`。

- [ ] **Step 1: 写 URL 提取和 Markdown 标题推断的失败测试**

```ts
it("extracts title and article text", async () => {
  const service = new WebContentService({ fetchImpl: async () => new Response(
    "<html><head><title>网页标题</title></head><body><article><h1>正文</h1><p>足够长的学习内容。</p></article></body></html>",
    { headers: { "content-type": "text/html" } },
  ) });
  await expect(service.fetch("https://example.com/a")).resolves.toEqual({ title: "网页标题", content: "正文\n足够长的学习内容。" });
});

it("uses the first Markdown heading when title is absent", async () => {
  await expect(storage.resolveImportContent({ type: "markdown", content: "# React\n\n内容" }))
    .resolves.toMatchObject({ title: "React" });
});
```

- [ ] **Step 2: 验证测试为红色**

Run: `rtk pnpm --filter @learning-os/server test -- web-content.service.spec.ts storage.service.spec.ts`

Expected: FAIL，服务和解析方法尚不存在。

- [ ] **Step 3: 实现最小抓取与来源解析**

`WebContentService` 只接受 `http:`/`https:`，使用注入 `fetchImpl` 和 `AbortSignal.timeout(10_000)`；仅接受 `ok` 且 `content-type` 含 `text/html` 的响应。按 `article`、`main`、`body` 顺序选内容，删除 `script/style/noscript`，将块标签转换为换行并去标签、折叠空白。分别抛出带 `code` 的 `web_url_invalid`、`web_fetch_failed`、`web_content_unsupported`、`web_content_empty` 错误。

`resolveImportContent`：文本须有标题和正文；Markdown 显式标题优先，缺省时用 `/^#\s+(.+)$/m`；URL 调抓取服务且显式标题覆盖网页标题。将网页服务注册为 IngestionModule provider。

- [ ] **Step 4: 补齐错误测试并验证绿色**

```ts
it.each([["file:///tmp/a", "web_url_invalid"], ["https://a.test/x.pdf", "web_content_unsupported"]])(
  "rejects invalid source %s", async (url, code) => {
    await expect(service.fetch(url)).rejects.toMatchObject({ code });
  },
);
```

Run: `rtk pnpm --filter @learning-os/server test -- web-content.service.spec.ts storage.service.spec.ts`

Expected: exit code 0。

- [ ] **Step 5: 提交来源解析**

```bash
rtk git add apps/server/src/infrastructure/web apps/server/src/infrastructure/storage apps/server/src/modules/ingestion/ingestion.module.ts
rtk git commit -m "feat: 支持网页与 Markdown 来源解析"
```

### Task 3: 改造导入为异步任务并提供人工重试

**Files:**

- Modify: `apps/server/src/modules/ingestion/ingestion.service.ts`
- Modify: `apps/server/src/modules/ingestion/ingestion.controller.ts`
- Modify: `apps/server/src/modules/ingestion/dto/create-import.dto.ts`
- Create: `apps/server/src/modules/ingestion/retry-ingestion.spec.ts`
- Modify: `apps/server/src/modules/ingestion/ingestion.service.spec.ts`

**Interfaces:**

- Produces: `createImport(input): Promise<{ sourceId: string; sessionId: string; status: "processing" }>`。
- Produces: `runImportTask(sessionId): Promise<void>` 与 `retryIngestion(sessionId)`。
- Produces: `POST /ingestions/:sessionId/retry`。

- [ ] **Step 1: 写创建不等待生成和重试的失败测试**

```ts
it("returns processing before generation resolves", async () => {
  const deferred = createDeferred<GeneratedCandidates>();
  const service = createIngestionService({ generateCandidates: vi.fn(() => deferred.promise) });
  await expect(service.createImport({ type: "text", title: "RSC", content: "正文" }))
    .resolves.toMatchObject({ status: "processing" });
  expect(dependencies.agentTask.create).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ status: "pending", attemptCount: 1 }),
  }));
});

it("increments retry count for a failed ingestion", async () => {
  await service.retryIngestion("failed_session");
  expect(dependencies.agentTask.update).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ status: "pending", attemptCount: 2 }),
  }));
});
```

- [ ] **Step 2: 验证测试为红色**

Run: `rtk pnpm --filter @learning-os/server test -- ingestion.service.spec.ts retry-ingestion.spec.ts`

Expected: FAIL，现有代码同步等待生成，且不存在重试。

- [ ] **Step 3: 实现状态机与重试边界**

创建导入时先保存 Source、`processing` 会话和 `pending` 任务，再 `queueMicrotask(() => void this.runImportTask(session.id))`，立即返回。`runImportTask` 把任务置 `running`，解析来源、更新 Source、生成候选、清空旧候选并写入新候选；成功后更新任务 `succeeded` 和会话 `reviewable`。捕获异常时写入稳定错误码/文案，任务和会话都变为 `failed`。

`retryIngestion` 仅接受 `failed` 会话：清错误、状态改 `pending`、尝试次数加一、会话改 `processing` 并再次入队。非失败会话抛 `BadRequestException("仅失败的导入任务可以重试")`。控制器新增 POST 重试路由。

- [ ] **Step 4: 添加失败状态和非法重试测试**

```ts
it("records a stable URL error", async () => {
  dependencies.storage.resolveImportContent.mockRejectedValue({ code: "web_fetch_failed", message: "无法访问网页" });
  await service.runImportTask("s1");
  expect(dependencies.agentTask.update).toHaveBeenLastCalledWith(expect.objectContaining({
    data: expect.objectContaining({ status: "failed", lastErrorCode: "web_fetch_failed" }),
  }));
});

it("rejects retry for reviewable session", async () => {
  await expect(service.retryIngestion("reviewable_session")).rejects.toThrow("仅失败的导入任务可以重试");
});
```

- [ ] **Step 5: 运行测试并提交**

Run: `rtk pnpm --filter @learning-os/server test -- ingestion.service.spec.ts retry-ingestion.spec.ts`

Expected: exit code 0。

```bash
rtk git add apps/server/src/modules/ingestion
rtk git commit -m "feat: 支持导入任务状态与手动重试"
```

### Task 4: 生成结构化笔记并以文件先写、事务后提交方式入库

**Files:**

- Modify: `apps/server/src/infrastructure/storage/storage.service.ts`
- Modify: `apps/server/src/infrastructure/storage/storage.service.spec.ts`
- Modify: `apps/server/src/modules/ingestion/ingestion.service.ts`
- Modify: `apps/server/src/modules/ingestion/confirm-ingestion.spec.ts`

**Interfaces:**

- Produces: `writeNotes(notes): Promise<Array<{ title: string; content: string; localPath: string }>>` 和 `removeFiles(paths)`。
- Consumes: Task 1 的 `transaction`，Task 3 的会话/任务状态。

- [ ] **Step 1: 写 Markdown 结构与文件失败保护的红色测试**

```ts
it("writes a structured Markdown note", async () => {
  const [note] = await storage.writeNotes([{
    conceptId: "concept_1", sourceId: "source_1", title: "RSC", summary: "服务端组件", evidence: "服务端渲染",
    cards: [{ id: "card_1", type: "qa", question: "RSC 是什么？", answer: "服务端组件", isSelected: true }],
  }]);
  expect(await readFile(note.localPath, "utf8")).toContain("conceptId: concept_1");
  expect(note.content).toContain("## 复习卡片");
});

it("does not begin database transaction when note writing fails", async () => {
  storage.writeNotes.mockRejectedValueOnce(new Error("disk_full"));
  await expect(service.confirmIngestion("s1", { selectedCandidateIds: ["c1"] })).rejects.toThrow("disk_full");
  expect(prisma.transaction).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: 验证测试为红色**

Run: `rtk pnpm --filter @learning-os/server test -- storage.service.spec.ts confirm-ingestion.spec.ts`

Expected: FAIL，`writeNotes` 和事务保护尚不存在。

- [ ] **Step 3: 实现笔记写入与确认事务**

笔记文件名为 `safeFileStem(title)-${conceptId}.md`，同目录先写随机 `.tmp` 后 `rename`。正文精确包含 YAML `conceptId`、`sourceId`、`createdAt`、`tags: []`，以及“摘要、核心解释、证据、复习卡片”章节。

确认时要求会话为 `reviewable`，为每个选中候选预分配 `randomUUID()` 知识点 ID，过滤选中卡片并先调用 `writeNotes`。文件成功后在 `prisma.transaction` 中创建 Concept、ReviewCard、包含 `localPath` 的 Note，最后置会话为 `imported` 并写入时间戳。事务失败时 `removeFiles` 后重新抛出；非可审核会话抛 `BadRequestException("仅可确认待审核的导入")`。

- [ ] **Step 4: 写事务失败清理与重复确认测试**

```ts
it("removes note files after database transaction failure", async () => {
  prisma.transaction.mockRejectedValueOnce(new Error("sqlite_failed"));
  await expect(service.confirmIngestion("s1", { selectedCandidateIds: ["c1"] })).rejects.toThrow("sqlite_failed");
  expect(storage.removeFiles).toHaveBeenCalledWith(["/tmp/notes/RSC-concept_1.md"]);
});

it("rejects confirmation after import", async () => {
  await expect(service.confirmIngestion("imported_session", { selectedCandidateIds: ["c1"] }))
    .rejects.toThrow("仅可确认待审核的导入");
});
```

- [ ] **Step 5: 验证绿色并提交**

Run: `rtk pnpm --filter @learning-os/server test -- storage.service.spec.ts confirm-ingestion.spec.ts`

Expected: exit code 0。

```bash
rtk git add apps/server/src/infrastructure/storage apps/server/src/modules/ingestion/ingestion.service.ts apps/server/src/modules/ingestion/confirm-ingestion.spec.ts
rtk git commit -m "feat: 导入确认时保存结构化笔记"
```

### Task 5: 暴露任务详情 API 并更新前端导入体验

**Files:**

- Modify: `apps/server/src/modules/ingestion/ingestion.service.ts`
- Modify: `apps/server/src/modules/ingestion/ingestion.controller.ts`
- Modify: `apps/console/src/shared/api/api-client.ts`
- Create: `apps/console/src/shared/api/api-client.spec.ts`
- Modify: `apps/console/src/features/ingestion/import-page.tsx`
- Modify: `apps/console/src/features/ingestion/import-page.test.tsx`
- Modify: `apps/console/src/features/ingestion/ingestion-review-page.tsx`
- Modify: `apps/console/src/features/ingestion/ingestion-review-page.test.tsx`
- Modify: `apps/console/src/app/styles.css`

**Interfaces:**

- Produces: `GET /ingestions/:sessionId` 中的任务摘要和 `POST /ingestions/:sessionId/retry`。
- Produces: `apiClient.retryIngestion(sessionId)`。

- [ ] **Step 1: 写 API 与界面的失败测试**

```ts
it("posts to the retry endpoint", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ sessionId: "s1", status: "processing" }), { status: 200 })));
  await apiClient.retryIngestion("s1");
  expect(fetch).toHaveBeenCalledWith("http://127.0.0.1:3000/ingestions/s1/retry", expect.objectContaining({ method: "POST" }));
});
```

```tsx
it("submits URL import without a body", async () => {
  vi.mocked(apiClient.createImport).mockResolvedValueOnce({ sourceId: "src", sessionId: "s1", status: "processing" });
  render(<MemoryRouter><ImportPage /></MemoryRouter>);
  fireEvent.click(screen.getByRole("radio", { name: "URL" }));
  fireEvent.change(screen.getByLabelText("网页地址"), { target: { value: "https://example.com/a" } });
  fireEvent.click(screen.getByRole("button", { name: "开始整理" }));
  await waitFor(() => expect(apiClient.createImport).toHaveBeenCalledWith({ type: "url", title: undefined, url: "https://example.com/a" }));
});

it("shows retry action for failed ingestion", () => {
  render(<MemoryRouter><IngestionReviewPage data={failedDetail} /></MemoryRouter>);
  expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
});
```

- [ ] **Step 2: 验证测试为红色**

Run: `rtk pnpm --filter @learning-os/console test -- api-client.spec.ts import-page.test.tsx ingestion-review-page.test.tsx`

Expected: FAIL，客户端重试和前端状态入口不存在。

- [ ] **Step 3: 实现 API 映射和多来源界面**

详情将任务映射为 `canRetry: session.status === "failed" && task.status === "failed"`；控制器添加重试端点；客户端添加：

```ts
retryIngestion(sessionId: string) {
  return request<{ sessionId: string; status: string }>(`/ingestions/${sessionId}/retry`, { method: "POST" });
}
```

导入页用三个 radio（文本、URL、Markdown）切换字段：URL 模式 URL 必填且标题可选，Markdown 标题可选且提示一级标题推断。审核页仅在 `processing` 每秒刷新一次并在 cleanup 停止；`failed` 显示错误摘要、尝试次数和“重试”；`reviewable` 才显示候选确认；`imported` 显示已入库和知识库入口。

- [ ] **Step 4: 增加轮询和重试交互测试**

```tsx
it("refreshes processing detail until reviewable", async () => {
  vi.useFakeTimers();
  vi.mocked(apiClient.getIngestionDetail).mockResolvedValueOnce(processingDetail).mockResolvedValueOnce(reviewableDetail);
  render(<MemoryRouter><IngestionReviewPage /></MemoryRouter>);
  await vi.advanceTimersByTimeAsync(1000);
  expect(apiClient.getIngestionDetail).toHaveBeenCalledTimes(2);
  vi.useRealTimers();
});

it("retries failed ingestion", async () => {
  vi.mocked(apiClient.retryIngestion).mockResolvedValueOnce({ sessionId: "s1", status: "processing" });
  render(<MemoryRouter><IngestionReviewPage data={failedDetail} /></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "重试" }));
  await waitFor(() => expect(apiClient.retryIngestion).toHaveBeenCalledWith("s1"));
});
```

- [ ] **Step 5: 验证 Console 并提交**

Run: `rtk pnpm --filter @learning-os/console test && rtk pnpm --filter @learning-os/console build`

Expected: exit code 0。

```bash
rtk git add apps/server/src/modules/ingestion apps/console/src/shared/api apps/console/src/features/ingestion apps/console/src/app/styles.css
rtk git commit -m "feat: 增加多来源导入与失败重试界面"
```

### Task 6: 全量验证与手动验收说明

**Files:**

- Modify: `README.md`
- Modify: `doc/plan/2026-07-14-import-task-notes-implementation-plan.md`

**Interfaces:**

- Consumes: Tasks 1-5 的完整闭环。
- Produces: 用户可执行的本地验证步骤。

- [ ] **Step 1: 写 README 手动验收步骤**

在“已验证流程”后添加：设置 DeepSeek 配置后，用户自行启动 `pnpm dev:web`，提交公开 URL 和 Markdown，观察处理中/失败重试，确认候选结果，并在 `.learning-os/notes/` 检查 Markdown 文件；明确自动化测试不访问真实网页或模型。

- [ ] **Step 2: 运行全量单元测试**

Run: `rtk pnpm test:unit`

Expected: 所有参与包测试通过，exit code 0。

- [ ] **Step 3: 运行全仓构建**

Run: `rtk pnpm build`

Expected: 所有参与包构建通过，exit code 0。

- [ ] **Step 4: 检查范围与格式后提交**

Run: `rtk git diff --check && rtk git status --short`

Expected: `git diff --check` 无输出，状态只含计划范围文件。

```bash
rtk git add README.md doc/plan/2026-07-14-import-task-notes-implementation-plan.md
rtk git commit -m "docs: 补充导入任务验证说明"
```

## 计划自检

- 设计覆盖：Task 1 覆盖任务数据；Task 2 覆盖 URL/Markdown；Task 3 覆盖异步状态与手动重试；Task 4 覆盖双写笔记；Task 5 覆盖 API 与界面；Task 6 覆盖全量验证和手动验收。
- 占位检查：没有未定项；每项均给出文件、接口、失败测试、验证命令与提交范围。
- 类型一致性：`AgentTaskDto`、`CreateImportDto`、`runImportTask`、`retryIngestion`、`writeNotes` 在任务间使用一致。

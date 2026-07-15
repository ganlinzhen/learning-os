# Task 5 实施报告：前端多来源导入、状态轮询与重试

## 交付内容

- API client 新增 `retryIngestion(sessionId)`，请求 `POST /ingestions/:sessionId/retry`。
- 导入页支持文本、URL、Markdown 三种可访问的 radio 模式。
- 每种模式独立构造 payload，不携带其他模式字段；可选标题为空时不会提交空字段。
- 创建成功后导航到 `/ingestions/:sessionId`，提交中禁用按钮，失败时显示中文操作提示。
- 会话页支持首次详情加载、processing 每 1000ms 轮询、状态离开 processing 后停止轮询。
- 组件卸载或 sessionId 变化时清理旧定时器，并通过活动标记忽略旧请求结果，避免卸载后更新状态。
- failed 状态展示错误、尝试次数和按 `task.canRetry` 控制的“重试”按钮；请求期间防重复点击。
- 重试成功后切换 processing 并恢复轮询；失败后保留重试入口并显示错误。
- reviewable、imported、pending、running 等状态按简报分别展示对应内容。

## TDD 记录

### RED

首次只修改测试后运行指定命令：

```bash
rtk pnpm --filter @learning-os/console test -- api-client.spec.ts import-page.test.tsx ingestion-review-page.test.tsx router.test.tsx
```

结果：5 个测试文件中 3 个失败，18 个测试中 14 个失败、4 个通过。失败均来自待实现行为：缺少重试 API、来源 radio 与条件字段、轮询、失败重试和 imported 界面。

自审收紧按钮文案时又执行一次小型 RED：将测试期望改为简报原文“重试”后，18 个测试中 4 个按预期失败。

### GREEN

实现最小生产代码后，同一测试集结果为 5 个文件、18 个测试全部通过。按钮文案修正后的第二轮 GREEN 同样为 18/18 通过。测试输出无 React `act` 警告和卸载后更新警告。

## 验证

- 指定测试：通过，5 个测试文件、18 个测试、0 失败。
- Console 构建：通过，TypeScript 检查与 Vite 生产构建均成功。
- `git diff --check`：通过，无空白错误。
- 未启动 dev server 或浏览器。

## 修改文件

- `apps/console/src/shared/api/api-client.ts`
- `apps/console/src/shared/api/api-client.spec.ts`
- `apps/console/src/features/ingestion/import-page.tsx`
- `apps/console/src/features/ingestion/import-page.test.tsx`
- `apps/console/src/features/ingestion/ingestion-review-page.tsx`
- `apps/console/src/features/ingestion/ingestion-review-page.test.tsx`
- `apps/console/src/app/styles.css`
- `.superpowers/sdd/task-5-report.md`

## 自审

- 所有 `IngestionDetailDto` 测试 fixture 均包含必填 `task`。
- URL 模式只提交 `type/title?/url`，Markdown 只提交 `type/title?/content`，文本只提交 `type/title/content`。
- processing 轮询采用递归 `setTimeout`，不会在上一次请求完成前叠加请求。
- reviewable、failed、imported 的初始 data 不会无故请求详情；processing 的初始 data 会继续轮询。
- 重试按钮在请求期间禁用，重复点击不会产生第二次请求。
- 轮询 effect 在卸载、sessionId 变化和状态离开 processing 时清理定时器；尚未完成的旧请求结果不会写回状态。
- 未修改服务端、preload、router 或依赖。

## 顾虑

- 轮询清理会停止后续调度并忽略在途结果，但当前 API client 没有暴露 `AbortSignal`，因此已经发出的 HTTP 请求不会被物理取消；这不影响停止旧轮询和避免旧请求写回的行为。
- 按项目约束未进行浏览器实机验证，界面布局需由用户按手动路径验收。

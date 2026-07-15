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

---

## P2 修复：用户动作的跨会话异步隔离

### 修复内容

- retry 与 confirm 在动作开始时同时捕获 sessionId 和组件生命周期 generation。
- sessionId 变化时同步推进 generation；组件卸载时再次推进 generation 并标记生命周期失效。
- sessionId 变化后重置 retrying、confirming、retryError、confirmError，避免新会话继承旧操作状态。
- 旧请求的成功、失败和 finally 分支都会检查捕获的 sessionId 与 generation；失效请求不再更新数据、错误、按钮状态或导航。
- retry 成功使用函数式状态更新，并再次核对当前 data 的 sessionId，避免旧闭包覆盖轮询或新会话数据。
- confirm 增加进行中 guard；按钮在请求期间禁用并显示“正在入库…”。
- confirm 失败被捕获并以 `role="alert"` 显示“入库失败，请稍后重试。”，不会产生未处理拒绝。

### TDD 记录

RED 阶段先新增跨会话与确认操作测试。旧实现稳定出现 4 个断言失败和 1 个未处理拒绝：

- 会话 A 重试中切换到 B 后，B 的按钮仍显示“正在重试…”。
- A 的重试失败会覆盖 B 的原始错误。
- confirm 没有禁用状态及“正在入库…”文案。
- A 的 confirm 成功后仍会导航 B；A 的 confirm 失败产生未处理拒绝。

GREEN 阶段实现最小生命周期隔离与确认状态后，新增并保留了以下回归覆盖：

- A→B 后 retry resolve/reject 均不覆盖 B。
- A→B 后 confirm resolve/reject 均不写入 B 或导航。
- confirm 双击只调用一次 API，失败显示中文提示并恢复入口。
- 当前会话 confirm 成功才导航知识库。
- 组件卸载后 confirm 成功不会继续导航。

### 最终验证

```bash
rtk pnpm --filter @learning-os/console test -- api-client.spec.ts import-page.test.tsx ingestion-review-page.test.tsx router.test.tsx
```

结果：5 个测试文件、25 个测试全部通过，0 个未处理错误。

```bash
rtk pnpm --filter @learning-os/console build
```

结果：TypeScript 检查与 Vite 生产构建成功，共转换 49 个模块。

本次 P2 修复仅修改会话审核页、对应测试和本报告；未修改服务端、preload、样式或依赖，也未启动 dev server 或浏览器。

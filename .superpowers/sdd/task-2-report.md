# Task 2 实施报告：网页抓取与 Markdown 来源解析

## 交付内容

- 新增 `WebContentService.fetch(url)`：限制 `http:`/`https:`，通过可注入 `fetch` 与 `AbortSignal.timeout(10000)` 抓取 HTML。
- 仅接受成功的 `text/html` 响应；按 `article`、`main`、`body` 顺序提取正文，移除 `script`、`style`、`noscript`，并完成块级换行、去标签、常见实体解码与空白折叠。
- 提供稳定错误码：`web_url_invalid`、`web_fetch_failed`、`web_content_unsupported`、`web_content_empty`；空标题/正文和 URL 缺失均以带 `code` 属性的错误返回。
- 新增 `StorageService.resolveImportContent(input)`：支持文本、Markdown 与 URL；Markdown 可从首个一级标题推断标题，URL 显式标题优先于网页标题。
- 在 `IngestionModule` 注册 `WebContentService`。

## TDD 记录

### RED

先新增并运行以下失败规格：

```bash
rtk pnpm --filter @learning-os/server test -- web-content.service.spec.ts storage.service.spec.ts
```

失败原因符合预期：`WebContentService` 模块不存在，`StorageService.resolveImportContent` 尚未实现，且网页服务尚未注入。随后又为“错误必须带稳定 code”补充 URL 缺失场景；该测试先失败，原因是错误对象只有消息而没有 `code` 属性。

### GREEN

以最小实现新增网页服务、来源解析和模块注册；导出并复用带 `code` 属性的 `WebContentError`。修正一次正则转义造成的 TypeScript 转译失败后，重新运行目标测试通过。

独立审阅后，追加失败测试覆盖空网页标题、空白显式标题的 Markdown/URL 回退、常见命名实体和越界数值实体。随后要求网页标题与正文均非空、扩展常见实体映射、对非法 Unicode 标量安全保留原实体，并使空白标题按未提供处理；再次运行后转绿。

## 验证结果

```bash
rtk pnpm --filter @learning-os/server test -- web-content.service.spec.ts storage.service.spec.ts
```

结果：11 个测试文件、31 项测试全部通过（Vitest 会同时收集同项目的其余规格）。

```bash
rtk pnpm --filter @learning-os/server lint
```

结果：通过，`tsc --noEmit -p tsconfig.json` 无错误。

另运行 `rtk git diff --check`，无空白错误。

## 自审

- 变更仅限任务简报指定的服务、规格和 `IngestionModule`，以及本报告；未触碰 `apps/shell/.preload-build`、前端、导入状态机或重试逻辑。
- HTML 解析不增加第三方依赖；选择器顺序和文本归一化符合简报。
- `StorageService` 的 Web 服务依赖为可选注入，保留根模块中既有 `StorageService` 注册的兼容性；`IngestionModule` 中则显式注册该服务。
- 已完成独立代码审阅并修正其关于空标题、空白显式标题、常见实体和非法数值实体的全部阻塞意见。

## 顾虑

- HTML 提取采用无新增依赖的正则实现，适用于简报要求的基础标签和正文选择；若后续需处理严重畸形 HTML、复杂嵌套或更完整的语义抽取，应在产品允许新增依赖时改用专门的 HTML 解析器。
- 当前按简报只限制 URL 协议。若后续把 URL 导入开放给不可信用户输入，应补充私网、回环、链路本地地址及重定向链路的 SSRF 防护。

## 审查修复：过滤网页脚本伪标签

### RED

新增回归规格：完整 HTML 中先出现的 `script` 和 HTML 注释分别包含伪造的 `title`、`article`，真实 `title` 与 `main` 位于其后。修复前运行：

```bash
rtk pnpm --filter @learning-os/server test -- web-content.service.spec.ts
```

结果：按预期失败，提取得到“伪标题”和“伪正文”。根因是先用正则选择标签、后在 `toText` 阶段移除非内容段，导致选择器已命中脚本文本。

### GREEN 与验证

新增最小的完整 HTML 预处理：先移除 `script`、`style`、`noscript` 和 HTML 注释原始段，再选择 `title` 及 `article`/`main`/`body`。保留 `toText` 的相同预处理，确保任何传入片段也不会保留这些段。

```bash
rtk pnpm --filter @learning-os/server test -- web-content.service.spec.ts
```

结果：11 个测试文件、32 项测试全部通过。

```bash
rtk pnpm --filter @learning-os/server lint
rtk git diff --check
```

结果：均通过。

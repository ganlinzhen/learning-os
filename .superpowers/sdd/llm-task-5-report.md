# LLM 设置 Task 5 实施报告

## 实现内容

- 新增 Console 设置页、`/settings` 路由和侧栏“设置”入口。
- 新增 LLM 设置 API 客户端方法，覆盖读取、保存、保存并测试、清除密钥四个接口。
- API Key 使用密码输入框，仅在用户输入新值时进入保存 payload；空值保持已有密钥不变。
- 采用原生 `dialog` 承载清除密钥确认，并在请求期间禁用保存和清除相关操作。
- 页面使用单列阅读区、大留白、细边框白色面板与行间分隔，沿用深绿色侧栏与低饱和状态色。

## TDD 记录

- RED：`pnpm --filter @learning-os/console test -- settings-page.test.tsx` 失败，原因符合预期：`SettingsPage`、LLM API 方法和 `settings` 路由尚未实现。
- GREEN：实现后，设置页 7 项测试、API 客户端 2 项测试和路由/侧栏 2 项测试均通过。

## 验证

```text
pnpm --filter @learning-os/console test -- settings-page.test.tsx api-client.spec.ts router.test.tsx
35 项测试通过。

pnpm --filter @learning-os/console build
TypeScript 检查与 Vite 构建通过。

git diff --check
通过，无空白错误。
```

## 注意事项

- 未启动开发服务器或浏览器，符合前端任务的验证约定。
- 工作区中已存在的 `apps/shell/.preload-build/preload/preload.cjs` 删除未修改、未暂存。

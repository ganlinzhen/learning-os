# LLM 设置页 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在设置页中直接管理 DeepSeek API Key、Base URL 和模型名称，并支持保存后立即测试连接。

**Architecture:** Server 在 `LEARNING_OS_LLM_CONFIG_PATH` 指向的本地 JSON 文件中原子保存配置，并只向 Console 返回脱敏状态。Generator 在每次请求时优先读取该文件，`POST /test-connection` 使用同一份配置发起最小 DeepSeek 请求；Shell 与根开发脚本为 Server 和 Generator 注入相同路径。

**Tech Stack:** React 19、React Router、NestJS 11、TypeScript、FastAPI、Pydantic、httpx、Vitest、pytest。

## Global Constraints

- 只支持 DeepSeek 的 API Key、Base URL 和模型名称；不实现多 Provider、模型列表和 Embedding 配置。
- API Key 只写入用户本地配置文件；任何读取 API 均不得返回明文密钥。
- 设置文件必须通过同目录临时文件与 rename 原子替换，并使用 `0o600` 权限。
- `LEARNING_OS_LLM_CONFIG_PATH` 存在时是 Generator 的唯一配置来源；环境变量和 `.env` 仅在该变量未设置时保持既有回退行为。
- “保存并测试连接”会保留当前表单配置，即使实际连接失败；失败时返回稳定的配置或连接错误，不自动回滚。
- 保持用户已有的 `apps/shell/.preload-build/preload/preload.cjs` 未暂存删除，不纳入任何提交。
- 不启动 dev server、浏览器或 Electron；只运行自动化测试、类型检查与构建。

---

## 文件结构

| 文件 | 职责 |
| --- | --- |
| `packages/contracts/src/settings.ts` | Console 和 Server 共享的设置读写 DTO。 |
| `apps/server/src/modules/settings/*` | 配置文件读写、HTTP API、输入校验和 Generator 测试转发。 |
| `apps/server/src/infrastructure/config/app-config.service.ts` | 暴露共享 LLM 配置文件路径。 |
| `apps/server/src/infrastructure/agent/agent-client.service.ts` | 调用 Generator 的连接测试端点。 |
| `apps/generator/src/learning_os_generator/infrastructure/deepseek.py` | 加载共享 JSON 配置并执行最小连接测试请求。 |
| `apps/generator/src/learning_os_generator/api/app.py` | 暴露 `POST /test-connection`。 |
| `apps/shell/src/main/runtime-paths.ts`、`package.json` | 为运行时注入同一个绝对配置路径。 |
| `apps/console/src/features/settings/settings-page.tsx` | 参考图风格的 DeepSeek 设置页面。 |

### Task 1：定义设置接口并实现 Server 本地配置服务

**Files:**
- Create: `packages/contracts/src/settings.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `apps/server/src/modules/settings/llm-settings.service.ts`
- Create: `apps/server/src/modules/settings/llm-settings.service.spec.ts`
- Modify: `apps/server/src/infrastructure/config/app-config.service.ts`

**Interfaces:**
- Produces `LlmSettingsDto = { provider: "deepseek"; apiKeyConfigured: boolean; baseUrl: string; model: string }`.
- Produces `UpdateLlmSettingsDto = { apiKey?: string; baseUrl: string; model: string }`.
- Produces `LlmSettingsService.get(): Promise<LlmSettingsDto>`, `save(input): Promise<LlmSettingsDto>` and `clearApiKey(): Promise<LlmSettingsDto>`.
- `AppConfigService.llmConfigPath` equals `process.env.LEARNING_OS_LLM_CONFIG_PATH ?? join(appRootDir, "settings", "llm.json")`.

- [ ] **Step 1: Write failing Server tests**

```ts
it("首次读取返回默认 DeepSeek 配置且不泄露密钥", async () => {
  const service = new LlmSettingsService({ llmConfigPath: path } as any);
  await expect(service.get()).resolves.toEqual({
    provider: "deepseek", apiKeyConfigured: false,
    baseUrl: "https://api.deepseek.com", model: "deepseek-v4-flash",
  });
});

it("保存原子写入并在空密钥时保留旧密钥", async () => {
  await service.save({ apiKey: "secret", baseUrl: "https://api.deepseek.com", model: "deepseek-v4-flash" });
  await service.save({ apiKey: "", baseUrl: "https://proxy.example/v1", model: "deepseek-chat" });
  expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({ apiKey: "secret", baseUrl: "https://proxy.example/v1" });
});

it.each(["ftp://host", "not-a-url"])("拒绝非 HTTP(S) Base URL", async (baseUrl) => {
  await expect(service.save({ baseUrl, model: "m" })).rejects.toBeInstanceOf(BadRequestException);
});
```

- [ ] **Step 2: Run the focused test to verify RED**

Run: `pnpm --filter @learning-os/server test -- llm-settings.service.spec.ts`

Expected: FAIL，因为模块和服务尚不存在。

- [ ] **Step 3: Add shared DTO and minimal implementation**

```ts
export interface LlmSettingsDto {
  provider: "deepseek";
  apiKeyConfigured: boolean;
  baseUrl: string;
  model: string;
}

export interface UpdateLlmSettingsDto {
  apiKey?: string;
  baseUrl: string;
  model: string;
}
```

`LlmSettingsService` must read `{ apiKey?, baseUrl?, model? }`, validate values, create the parent directory, write JSON to `.${basename(path)}.${randomUUID()}.tmp` using mode `0o600`, rename it, and return only the DTO. `clearApiKey()` must preserve Base URL and model while writing no `apiKey` property.

- [ ] **Step 4: Run the focused test to verify GREEN**

Run: `pnpm --filter @learning-os/server test -- llm-settings.service.spec.ts`

Expected: PASS; include file mode assertion on POSIX platforms and temporary-file cleanup assertion when write fails.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/settings.ts packages/contracts/src/index.ts apps/server/src/infrastructure/config/app-config.service.ts apps/server/src/modules/settings/llm-settings.service.ts apps/server/src/modules/settings/llm-settings.service.spec.ts
git commit -m "feat: 持久化本地 LLM 配置"
```

### Task 2：暴露设置 API 并转发连接测试

**Files:**
- Create: `apps/server/src/modules/settings/settings.controller.ts`
- Create: `apps/server/src/modules/settings/settings.controller.spec.ts`
- Create: `apps/server/src/modules/settings/settings.module.ts`
- Modify: `apps/server/src/app/app.module.ts`
- Modify: `apps/server/src/infrastructure/agent/agent-client.service.ts`
- Modify: `apps/server/src/infrastructure/agent/agent-client.service.spec.ts`

**Interfaces:**
- Produces `GET /settings/llm`, `PUT /settings/llm`, `POST /settings/llm/test`, and `DELETE /settings/llm/api-key`.
- `POST /settings/llm/test` accepts `UpdateLlmSettingsDto`, saves it first, then calls `AgentClientService.testLlmConnection(): Promise<void>`.
- Invalid HTTP input is a Nest `BadRequestException`; unavailable/failed Generator test becomes `BadGatewayException("LLM 连接测试失败，请检查配置后重试")`.

- [ ] **Step 1: Write failing controller/client tests**

```ts
expect(await controller.getLlmSettings()).toEqual(maskedSettings);
await controller.updateLlmSettings({ apiKey: "k", baseUrl: "https://api.deepseek.com", model: "deepseek-v4-flash" });
await controller.testLlmSettings({ apiKey: "k", baseUrl: "https://api.deepseek.com", model: "deepseek-v4-flash" });
expect(service.save).toHaveBeenCalledBefore(agent.testLlmConnection as any);
await expect(controller.testLlmSettings(validInput)).rejects.toBeInstanceOf(BadGatewayException);
```

```ts
await client.testLlmConnection();
expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:8000/test-connection", { method: "POST" });
```

- [ ] **Step 2: Run focused tests to verify RED**

Run: `pnpm --filter @learning-os/server test -- settings.controller.spec.ts agent-client.service.spec.ts`

Expected: FAIL，因为路由、模块和 `testLlmConnection` 尚不存在。

- [ ] **Step 3: Implement API wiring and stable errors**

Use `@Controller("settings")`, `@Get("llm")`, `@Put("llm")`, `@Post("llm/test")`, and `@Delete("llm/api-key")`. Register `SettingsModule` in `AppModule`; inject the existing `AgentClientService` and use its normal resolved Generator base URL. Keep the request body absent for Generator test requests because it must load the saved shared file itself.

- [ ] **Step 4: Run focused tests to verify GREEN**

Run: `pnpm --filter @learning-os/server test -- settings.controller.spec.ts agent-client.service.spec.ts`

Expected: PASS; assert no controller response ever contains `apiKey`.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/modules/settings apps/server/src/app/app.module.ts apps/server/src/infrastructure/agent/agent-client.service.ts apps/server/src/infrastructure/agent/agent-client.service.spec.ts
git commit -m "feat: 暴露 LLM 设置与连接测试接口"
```

### Task 3：让 Generator 使用共享配置并测试 DeepSeek 连接

**Files:**
- Modify: `apps/generator/src/learning_os_generator/infrastructure/deepseek.py`
- Modify: `apps/generator/src/learning_os_generator/api/app.py`
- Modify: `apps/generator/tests/test_deepseek.py`
- Modify: `apps/generator/tests/test_app.py`

**Interfaces:**
- `DeepSeekGenerator.from_environment()` reads JSON from `LEARNING_OS_LLM_CONFIG_PATH` when set; missing key yields `DeepSeekNotConfiguredError`.
- `DeepSeekGenerator.test_connection() -> None` posts a one-message, `max_tokens: 1`, non-streaming request and only accepts a successful HTTP response.
- `POST /test-connection` returns `{ "status": "ok" }`, 503 for no key, and 502 for upstream/response failures.

- [ ] **Step 1: Write failing Generator tests**

```python
def test_from_environment_prefers_shared_settings_file(tmp_path, monkeypatch):
    path = tmp_path / "llm.json"
    path.write_text(json.dumps({"apiKey": "saved", "baseUrl": "https://proxy.example/v1", "model": "saved-model"}))
    monkeypatch.setenv("LEARNING_OS_LLM_CONFIG_PATH", str(path))
    monkeypatch.setenv("DEEPSEEK_API_KEY", "ignored")
    assert DeepSeekGenerator.from_environment().api_key == "saved"

def test_test_connection_posts_small_request():
    generator = DeepSeekGenerator(api_key="key", client=httpx.Client(transport=httpx.MockTransport(lambda request: httpx.Response(200))))
    generator.test_connection()
```

```python
response = TestClient(app).post("/test-connection")
assert response.status_code == 200
assert response.json() == {"status": "ok"}
```

- [ ] **Step 2: Run focused tests to verify RED**

Run: `cd apps/generator && ../../.venv/bin/python -m pytest tests/test_deepseek.py tests/test_app.py -q`

Expected: FAIL，因为 JSON 配置加载、连接测试方法和端点尚不存在。

- [ ] **Step 3: Implement configuration precedence and test endpoint**

When `LEARNING_OS_LLM_CONFIG_PATH` is non-empty, parse only that JSON file and map its camelCase fields to the constructor. Do not fall through to process variables or `.env` in that mode. When it is absent, retain the current process-environment-over-dotenv behavior. `test_connection()` must reuse the client timeout and send the configured `model`, `{ role: "user", content: "ping" }`, `max_tokens: 1`, `thinking: { type: "disabled" }`, and `stream: false`; normalize `httpx` failures as `DeepSeekGenerationError`.

- [ ] **Step 4: Run focused tests to verify GREEN**

Run: `cd apps/generator && ../../.venv/bin/python -m pytest tests/test_deepseek.py tests/test_app.py -q`

Expected: PASS; cover missing shared file, malformed JSON, absent key, 401/500, and existing `.env` fallback.

- [ ] **Step 5: Commit**

```bash
git add apps/generator/src/learning_os_generator/infrastructure/deepseek.py apps/generator/src/learning_os_generator/api/app.py apps/generator/tests/test_deepseek.py apps/generator/tests/test_app.py
git commit -m "feat: 支持共享 LLM 配置与连接测试"
```

### Task 4：统一开发态与桌面版的配置路径

**Files:**
- Modify: `package.json`
- Modify: `apps/shell/src/main/runtime-paths.ts`
- Modify: `apps/shell/src/main/runtime-paths.spec.ts`

**Interfaces:**
- Root `dev:web`、`dev:server` 与 `dev:generator` use the absolute `${PWD}/.learning-os/settings/llm.json` path.
- `resolveRuntimePaths()` provides the same absolute `LEARNING_OS_LLM_CONFIG_PATH` in both `serverCommand.env` and `generatorCommand.env`, under `dataRootDir/settings/llm.json`.

- [ ] **Step 1: Write failing runtime tests**

```ts
expect(paths.serverCommand.env.LEARNING_OS_LLM_CONFIG_PATH).toBe("/tmp/user-data/runtime/settings/llm.json");
expect(paths.generatorCommand.env.LEARNING_OS_LLM_CONFIG_PATH).toBe(paths.serverCommand.env.LEARNING_OS_LLM_CONFIG_PATH);
```

- [ ] **Step 2: Run focused test to verify RED**

Run: `pnpm --filter @learning-os/shell test -- runtime-paths.spec.ts`

Expected: FAIL，因为两个命令当前没有共享配置路径环境变量。

- [ ] **Step 3: Implement runtime injection**

Compute `const llmConfigPath = join(dataRootDir, "settings", "llm.json")` once in `resolveRuntimePaths()`. Put it in both command env records in packaged mode. For the root dev commands, prefix the existing command with `LEARNING_OS_LLM_CONFIG_PATH="$PWD/.learning-os/settings/llm.json"`; preserve all existing command arguments and ports.

- [ ] **Step 4: Run focused test to verify GREEN**

Run: `pnpm --filter @learning-os/shell test -- runtime-paths.spec.ts`

Expected: PASS; development and production expectations both assert the shared path.

- [ ] **Step 5: Commit**

```bash
git add package.json apps/shell/src/main/runtime-paths.ts apps/shell/src/main/runtime-paths.spec.ts
git commit -m "feat: 统一 LLM 配置运行时路径"
```

### Task 5：实现参考风格的设置页面

**Files:**
- Create: `apps/console/src/features/settings/settings-page.tsx`
- Create: `apps/console/src/features/settings/settings-page.test.tsx`
- Modify: `apps/console/src/shared/api/api-client.ts`
- Modify: `apps/console/src/shared/api/api-client.spec.ts`
- Modify: `apps/console/src/app/router.tsx`
- Modify: `apps/console/src/app/app-shell.tsx`
- Modify: `apps/console/src/app/styles.css`

**Interfaces:**
- `apiClient.getLlmSettings`, `saveLlmSettings`, `testLlmSettings`, and `clearLlmApiKey` call the four Server routes.
- Route `/settings` renders `SettingsPage`.
- The API Key input sends only a newly typed value; blank input preserves the stored key.

- [ ] **Step 1: Write failing Console tests**

```tsx
render(<SettingsPage />);
expect(await screen.findByRole("heading", { name: "设置" })).toBeInTheDocument();
expect(screen.getByText("LLM 配置")).toBeInTheDocument();
expect(screen.getByText("已配置")).toBeInTheDocument();

await user.click(screen.getByRole("button", { name: "保存并测试连接" }));
expect(apiClient.testLlmSettings).toHaveBeenCalledWith({ apiKey: "new-key", baseUrl: "https://api.deepseek.com", model: "deepseek-v4-flash" });
```

```tsx
await user.click(screen.getByRole("button", { name: "清除 API Key" }));
expect(screen.getByRole("dialog")).toBeInTheDocument();
```

- [ ] **Step 2: Run focused test to verify RED**

Run: `pnpm --filter @learning-os/console test -- settings-page.test.tsx`

Expected: FAIL，因为页面、路由和 API 方法尚不存在。

- [ ] **Step 3: Implement settings UI and API client**

Use a `<main className="page settings-page">` with title “设置”, a “LLM 配置” heading and a `settings-panel` of three labelled rows. Keep the screenshot’s large vertical rhythm, thin dividers, restrained rounded panel and single-column reading order while using existing Learning OS colors. Use `type="password"`, `autoComplete="off"`, status text, helper text stating that the key is never shown again, inline validation, and a native `<dialog>` for clear confirmation. Disable both save actions during any pending request; render a `role="status"` success message and `role="alert"` failure message.

- [ ] **Step 4: Run focused tests to verify GREEN**

Run: `pnpm --filter @learning-os/console test -- settings-page.test.tsx api-client.spec.ts router.test.tsx`

Expected: PASS; cover loading, API-key masking, save, save-and-test success/failure, validation, disabled state, clear confirmation and the settings navigation link.

- [ ] **Step 5: Commit**

```bash
git add apps/console/src/features/settings apps/console/src/shared/api/api-client.ts apps/console/src/shared/api/api-client.spec.ts apps/console/src/app/router.tsx apps/console/src/app/app-shell.tsx apps/console/src/app/styles.css
git commit -m "feat: 增加 DeepSeek 设置页面"
```

### Task 6：文档、全量验证与收尾

**Files:**
- Modify: `README.md`
- Modify: `doc/2026-07-15-llm-settings-design.md`

- [ ] **Step 1: Update the user-facing documentation**

Replace the `.env`-only setup wording with the settings-page flow, document that API Key remains local and masked, describe “保存并测试连接” as a real DeepSeek request, and retain `.env` as the legacy fallback for standalone Generator development.

- [ ] **Step 2: Run all relevant checks**

Run: `pnpm exec turbo run test --filter=!@learning-os/e2e --force`

Expected: PASS for contracts, shell, server and console.

Run: `pnpm exec turbo run build --force`

Expected: PASS for every build task.

Run: `pnpm --filter @learning-os/server lint`

Expected: PASS.

Run: `cd apps/generator && ../../.venv/bin/python -m pytest tests -q`

Expected: PASS.

- [ ] **Step 3: Verify repository hygiene**

Run: `git diff --check` and `git status --short`.

Expected: no whitespace errors; only the user-owned preload deletion remains unstaged; no `.learning-os` or secret file is tracked.

- [ ] **Step 4: Commit documentation**

```bash
git add README.md doc/2026-07-15-llm-settings-design.md doc/plan/2026-07-15-llm-settings-implementation-plan.md
git commit -m "docs: 补充 LLM 设置使用说明"
```

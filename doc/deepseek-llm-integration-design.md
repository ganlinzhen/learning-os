# DeepSeek LLM 接入设计

## 目标

将 `apps/generator` 的候选知识点与复习卡片生成，从本地规则实现替换为 DeepSeek API 调用。DeepSeek 是唯一生成路径；缺少配置、网络或模型调用失败、以及响应不符合契约时，接口返回失败，导入任务不产生候选结果。

## 范围

- 使用 DeepSeek 的 OpenAI 兼容 `POST /chat/completions` 接口。
- 默认使用 `deepseek-v4-flash`，并关闭思考模式，保证导入等待时间和成本可控。
- 使用 JSON 输出模式，并将响应验证为已有的 `GenerateResponse` 契约。
- 在 `apps/generator/.env` 保存 `DEEPSEEK_API_KEY`，该文件已被根目录 `.gitignore` 忽略；新增不含真实密钥的 `.env.example`。
- 失败时通过 FastAPI 返回明确的 HTTP 错误；NestJS 现有调用会将该错误转换为导入失败。

不包含：规则生成降级、Provider 切换 UI、流式输出、重试、模型连通性页面或向量检索。

## 配置

Generator 在启动时从同目录 `.env` 加载配置；系统环境变量优先于文件值。

```dotenv
DEEPSEEK_API_KEY=...
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
```

配置缺失时，不在日志、HTTP 响应或异常中输出密钥；接口返回 `503` 与稳定错误码 `deepseek_not_configured`。

## 生成流程

1. `POST /generate` 接收标题与正文。
2. `DeepSeekGenerator` 根据输入构造中文 system/user 消息，要求只输出 JSON。
3. 请求携带 `response_format: {"type": "json_object"}`、`thinking: {"type": "disabled"}` 和输出 token 上限。
4. 解析 `choices[0].message.content` 为 JSON，并用 Pydantic `GenerateResponse` 校验字段、卡片类型和必填内容。
5. 成功时原样返回已有响应契约；上游 HTTP 状态、超时、空响应或 JSON/契约异常统一映射为 `502` 与 `deepseek_generation_failed`。

## 模块边界

- `settings.py`：加载并校验无密钥泄露的运行配置。
- `deepseek_client.py`：仅负责 HTTP 请求和外部错误归一化，可通过注入的 `httpx` transport 测试。
- `generation.py`：负责 Prompt、响应解析和 Pydantic 验证；不包含网络细节。
- `api/app.py`：将领域异常转成稳定的 HTTP 状态和错误体。

## 错误与可观测性

- 配置缺失：HTTP 503，`{"detail": "deepseek_not_configured"}`。
- 上游请求、超时、空内容、无 choices、JSON 解析或契约校验失败：HTTP 502，`{"detail": "deepseek_generation_failed"}`。
- 服务端日志仅记录错误码与异常类型，不记录 Authorization 请求头、环境变量或原始全文。

## 测试

- 配置缺失返回 503。
- DeepSeek 请求包含正确 URL、认证头、模型、JSON 输出和关闭思考模式。
- 合法模型 JSON 被转换为 `GenerateResponse`。
- 上游失败、空响应及不合法 JSON 均返回 502。
- 现有 API 成功路径用 mock transport 验证，测试不访问真实网络，也不使用真实密钥。

## 验收标准

- 本地 `.env` 中设置有效密钥后，导入文本调用 DeepSeek 并生成候选知识点与卡片。
- 未配置或调用异常时，导入失败而不是生成规则结果。
- 密钥不被 Git 跟踪，不出现在仓库示例、测试输出或日志中。

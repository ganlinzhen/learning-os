# DeepSeek LLM 接入设计

## 目标

将 `apps/generator` 的候选知识点与复习卡片生成，从本地规则实现替换为 DeepSeek API 调用。DeepSeek 是唯一生成路径；缺少配置、网络或模型调用失败、以及响应不符合契约时，接口返回失败，导入任务不产生候选结果。

## 范围

- 使用 DeepSeek 的 OpenAI 兼容 `POST /chat/completions` 接口。
- 默认使用 `deepseek-v4-flash`，并关闭思考模式，保证导入等待时间和成本可控。
- 使用 JSON 输出模式，并将响应验证为已有的 `GenerateResponse` 契约。
- 设置页将 API Key、Base URL 和模型名称原子写入用户本地配置文件；读取接口只返回 `apiKeyConfigured` 状态，绝不回显明文密钥。
- `apps/generator/.env` 与 `.env.example` 仅保留给独立调试 Generator 的遗留回退，不作为应用或根开发命令的配置入口。
- 失败时通过 FastAPI 返回明确的 HTTP 错误；NestJS 现有调用会将该错误转换为导入失败。

不包含：规则生成降级、Provider 切换 UI、流式输出、重试或向量检索。

## 配置

应用与根开发命令通过 `LEARNING_OS_LLM_CONFIG_PATH` 让 Server 和 Generator 使用同一份本地配置。设置页是推荐配置入口：API Key 仅保存在本机配置文件中，页面只显示“已配置/未配置”，保存后不回显明文。Generator 在每次生成前读取该文件，因此保存后无需重启即可对下一次导入生效；当该环境变量存在时，不会回退到进程环境变量或 `.env`。

只有独立运行 Generator 且未设置 `LEARNING_OS_LLM_CONFIG_PATH` 时，才从同目录 `.env` 和进程环境变量加载遗留配置，且系统环境变量优先于文件值：

```dotenv
DEEPSEEK_API_KEY=...
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
```

配置缺失时，不在日志、HTTP 响应或异常中输出密钥；接口返回 `503` 与稳定错误码 `deepseek_not_configured`。

“保存并测试连接”会先保存当前配置，再发起一次真实的最小 DeepSeek Chat Completions 请求。测试可能产生模型调用费用；认证、网络、模型或响应错误会返回明确失败状态，并保留已保存的配置供用户修正。

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

- 通过设置页保存有效密钥后，导入文本调用 DeepSeek 并生成候选知识点与卡片。
- 独立调试 Generator 时，未设置 `LEARNING_OS_LLM_CONFIG_PATH` 可使用本地 `.env` 作为遗留回退。
- 未配置或调用异常时，导入失败而不是生成规则结果。
- 密钥不被 Git 跟踪，不出现在仓库示例、测试输出或日志中。

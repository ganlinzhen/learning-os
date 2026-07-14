# DeepSeek LLM 接入实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标：** 用 DeepSeek API 替换 Generator 的规则候选生成，并在不可用时明确失败。

**架构：** FastAPI 通过依赖注入获得 `DeepSeekGenerator`。该生成器以 `httpx` 调用 DeepSeek 的 OpenAI 兼容接口，随后把 JSON 输出校验为既有 `GenerateResponse`；配置和网络/格式错误在 API 边界映射为稳定 HTTP 错误。

**技术栈：** Python 3.11、FastAPI、Pydantic v2、httpx、pytest、DeepSeek Chat Completions API。

## 全局约束

- 默认模型必须为 `deepseek-v4-flash`，base URL 必须为 `https://api.deepseek.com`。
- 只使用 DeepSeek 生成；禁止规则生成、降级、重试和流式输出。
- API Key 仅存在于被忽略的 `apps/generator/.env`；不得写入测试、示例、日志或 Git 跟踪文件。
- 请求必须启用 JSON 输出，并关闭思考模式。
- 配置缺失返回 HTTP 503 `deepseek_not_configured`；其他调用或响应错误返回 HTTP 502 `deepseek_generation_failed`。

---

### 任务 1：实现可测试的 DeepSeek 生成器

**文件：**
- 创建：`apps/generator/src/learning_os_generator/infrastructure/deepseek.py`
- 创建：`apps/generator/tests/test_deepseek.py`
- 修改：`apps/generator/src/learning_os_generator/domain/generation.py`

**接口：**
- 输入：`DeepSeekGenerator.generate(request: GenerateRequest) -> GenerateResponse`。
- 输出：`DeepSeekNotConfiguredError` 或 `DeepSeekGenerationError`，其余成功结果符合 `GenerateResponse`。
- 依赖：`httpx.Client`，通过构造器传入以支持 `httpx.MockTransport`。

- [ ] **步骤 1：先写失败测试**

```python
def test_generate_posts_json_request_and_validates_response():
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["request"] = request
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(VALID_RESPONSE)}}]})

    generator = DeepSeekGenerator(api_key="test-key", client=httpx.Client(transport=httpx.MockTransport(handler)))
    result = generator.generate(GenerateRequest(title="RSC", content="内容"))

    assert result.coreConcepts[0].title == "React Server Components"
    assert captured["request"].url == "https://api.deepseek.com/chat/completions"
    assert captured["request"].headers["authorization"] == "Bearer test-key"
```

- [ ] **步骤 2：运行失败测试并确认原因是缺少模块**

运行：`cd apps/generator && ../../.venv/bin/python -m pytest tests/test_deepseek.py -q`

预期：测试以 `ModuleNotFoundError: learning_os_generator.infrastructure.deepseek` 失败。

- [ ] **步骤 3：最小实现请求、解析和错误归一化**

```python
class DeepSeekNotConfiguredError(Exception):
    pass

class DeepSeekGenerationError(Exception):
    pass

class DeepSeekGenerator:
    def __init__(self, api_key: str | None, client: httpx.Client | None = None, base_url: str = "https://api.deepseek.com", model: str = "deepseek-v4-flash") -> None:
        self.api_key = api_key
        self.client = client or httpx.Client(timeout=30.0)
        self.base_url = base_url.rstrip("/")
        self.model = model

    def generate(self, request: GenerateRequest) -> GenerateResponse:
        if not self.api_key:
            raise DeepSeekNotConfiguredError()
        # POST /chat/completions，解析 choices[0].message.content 并用 GenerateResponse.model_validate 校验。
```

请求 JSON 必须包含：

```python
{
    "model": self.model,
    "messages": build_messages(request),
    "response_format": {"type": "json_object"},
    "thinking": {"type": "disabled"},
    "max_tokens": 4096,
    "stream": False,
}
```

- [ ] **步骤 4：运行生成器测试并确认通过**

运行：`cd apps/generator && ../../.venv/bin/python -m pytest tests/test_deepseek.py -q`

预期：退出码 0，包含 `passed`。

### 任务 2：替换 API 路径并验证失败语义

**文件：**
- 修改：`apps/generator/src/learning_os_generator/api/app.py`
- 修改：`apps/generator/src/learning_os_generator/domain/generation.py`
- 修改：`apps/generator/tests/test_app.py`

**接口：**
- 消费：`DeepSeekGenerator`、`DeepSeekNotConfiguredError`、`DeepSeekGenerationError`。
- 产出：`get_generator() -> DeepSeekGenerator` FastAPI 依赖；`POST /generate` 的成功、503、502 响应。

- [ ] **步骤 1：先写失败 API 测试**

```python
def test_generate_returns_503_when_deepseek_key_is_missing(monkeypatch):
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    response = client.post("/generate", json={"title": "RSC", "content": "内容"})
    assert response.status_code == 503
    assert response.json() == {"detail": "deepseek_not_configured"}

def test_generate_returns_502_when_generation_fails():
    app.dependency_overrides[get_generator] = lambda: FailingGenerator()
    response = client.post("/generate", json={"title": "RSC", "content": "内容"})
    assert response.status_code == 502
    assert response.json() == {"detail": "deepseek_generation_failed"}
```

- [ ] **步骤 2：运行 API 测试并确认现有规则结果不符合预期**

运行：`cd apps/generator && ../../.venv/bin/python -m pytest tests/test_app.py -q`

预期：新增断言失败，因为当前接口返回 HTTP 200 规则结果。

- [ ] **步骤 3：用依赖注入替换规则生成**

```python
def get_generator() -> DeepSeekGenerator:
    return DeepSeekGenerator.from_environment()

@app.post("/generate", response_model=GenerateResponse)
def generate(request: GenerateRequest, generator: Annotated[DeepSeekGenerator, Depends(get_generator)]) -> GenerateResponse:
    try:
        return generator.generate(request)
    except DeepSeekNotConfiguredError as error:
        raise HTTPException(status_code=503, detail="deepseek_not_configured") from error
    except DeepSeekGenerationError as error:
        raise HTTPException(status_code=502, detail="deepseek_generation_failed") from error
```

删除 `sentence_summary` 和所有按句号生成知识点、卡片的规则代码。

- [ ] **步骤 4：运行 API 与生成器测试并确认通过**

运行：`cd apps/generator && ../../.venv/bin/python -m pytest tests/test_app.py tests/test_deepseek.py -q`

预期：退出码 0，全部通过。

### 任务 3：提供安全本地配置并进行回归验证

**文件：**
- 创建：`apps/generator/.env.example`
- 创建（已忽略）：`apps/generator/.env`
- 修改：`apps/generator/pyproject.toml`
- 修改：`README.md`

**接口：**
- `.env` 的 `DEEPSEEK_API_KEY`、`DEEPSEEK_BASE_URL` 与 `DEEPSEEK_MODEL` 会被 `DeepSeekGenerator.from_environment()` 读取。
- `python-dotenv==1.1.1` 在启动时加载 Generator 根目录 `.env`，且不覆盖系统环境变量。

- [ ] **步骤 1：先写缺失配置测试**

```python
def test_generator_raises_configuration_error_without_api_key(monkeypatch):
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    with pytest.raises(DeepSeekNotConfiguredError):
        DeepSeekGenerator.from_environment().generate(GenerateRequest(title="RSC", content="内容"))
```

- [ ] **步骤 2：运行测试并确认失败原因正确**

运行：`cd apps/generator && ../../.venv/bin/python -m pytest tests/test_deepseek.py::test_generator_raises_configuration_error_without_api_key -q`

预期：在加入 `from_environment` 前以 `AttributeError` 失败。

- [ ] **步骤 3：实现配置加载并创建示例与本地密钥文件**

```python
from dotenv import load_dotenv

@classmethod
def from_environment(cls) -> "DeepSeekGenerator":
    load_dotenv(dotenv_path=Path(__file__).resolve().parents[3] / ".env", override=False)
    return cls(
        api_key=os.getenv("DEEPSEEK_API_KEY"),
        base_url=os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
        model=os.getenv("DEEPSEEK_MODEL", "deepseek-v4-flash"),
    )
```

`.env.example` 只写变量名和非敏感默认值；`.env` 只写用户提供的真实 Key 和默认 URL、模型。README 说明复制示例并在调用前配置密钥，不显示真实值。

- [ ] **步骤 4：运行完整 Generator 测试与类型/打包前构建验证**

运行：`cd apps/generator && ../../.venv/bin/python -m pytest tests -q`

预期：退出码 0，全部通过。

运行：`pnpm --filter @learning-os/server test && pnpm --filter @learning-os/server build`

预期：退出码 0；服务端与 Generator 契约兼容。

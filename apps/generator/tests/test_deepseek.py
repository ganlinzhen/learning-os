import json

import httpx
import pytest

from learning_os_generator.infrastructure.deepseek import (
    DeepSeekGenerationError,
    DeepSeekGenerator,
    DeepSeekNotConfiguredError,
)
from learning_os_generator.schemas.generation import GenerateRequest


VALID_RESPONSE = {
    "coreConcepts": [
        {
            "title": "React Server Components",
            "summary": "组件可以在服务端执行。",
            "evidence": "RSC allows server rendering.",
            "isCore": True,
            "isSelected": True,
            "cards": [
                {
                    "type": "qa",
                    "question": "RSC 是什么？",
                    "answer": "可在服务端执行的 React 组件。",
                    "explanation": "",
                    "isSelected": True,
                }
            ],
        }
    ],
    "candidateConcepts": [],
}


def test_generate_posts_json_request_and_validates_response():
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["request"] = request
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": json.dumps(VALID_RESPONSE)}}]},
        )

    generator = DeepSeekGenerator(
        api_key="test-key",
        client=httpx.Client(transport=httpx.MockTransport(handler)),
    )

    result = generator.generate(GenerateRequest(title="React Server Components", content="RSC allows server rendering."))

    request = captured["request"]
    assert result.coreConcepts[0].title == "React Server Components"
    assert str(request.url) == "https://api.deepseek.com/chat/completions"
    assert request.headers["authorization"] == "Bearer test-key"
    request_body = json.loads(request.content)
    assert request_body == {
        "model": "deepseek-v4-flash",
        "messages": request_body["messages"],
        "response_format": {"type": "json_object"},
        "thinking": {"type": "disabled"},
        "max_tokens": 4096,
        "stream": False,
    }
    assert "JSON" in request_body["messages"][0]["content"]
    assert request_body["messages"][1] == {
        "role": "user",
        "content": "标题：React Server Components\n\n正文：\nRSC allows server rendering.",
    }


def test_generate_requires_api_key():
    generator = DeepSeekGenerator(api_key=None)

    with pytest.raises(DeepSeekNotConfiguredError):
        generator.generate(GenerateRequest(title="RSC", content="内容"))


def test_generate_rejects_invalid_model_response():
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"choices": [{"message": {"content": "not json"}}]})

    generator = DeepSeekGenerator(
        api_key="test-key",
        client=httpx.Client(transport=httpx.MockTransport(handler)),
    )

    with pytest.raises(DeepSeekGenerationError):
        generator.generate(GenerateRequest(title="RSC", content="内容"))


@pytest.mark.parametrize(
    "payload",
    [
        {"choices": []},
        {"choices": [{"message": {"content": ""}}]},
        {"choices": [{"message": {"content": json.dumps({"coreConcepts": [], "candidateConcepts": [{}]})}}]},
    ],
)
def test_generate_rejects_missing_or_invalid_response_content(payload):
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=payload)

    generator = DeepSeekGenerator(
        api_key="test-key",
        client=httpx.Client(transport=httpx.MockTransport(handler)),
    )

    with pytest.raises(DeepSeekGenerationError):
        generator.generate(GenerateRequest(title="RSC", content="内容"))


def test_generate_normalizes_closed_http_client_error():
    client = httpx.Client(transport=httpx.MockTransport(lambda _: httpx.Response(200)))
    client.close()
    generator = DeepSeekGenerator(api_key="test-key", client=client)

    with pytest.raises(DeepSeekGenerationError):
        generator.generate(GenerateRequest(title="RSC", content="内容"))


def test_generate_normalizes_upstream_http_error():
    generator = DeepSeekGenerator(
        api_key="test-key",
        client=httpx.Client(transport=httpx.MockTransport(lambda _: httpx.Response(503))),
    )

    with pytest.raises(DeepSeekGenerationError):
        generator.generate(GenerateRequest(title="RSC", content="内容"))


def test_generate_normalizes_timeout_error():
    class TimeoutClient:
        def post(self, *_args, **_kwargs):
            raise httpx.TimeoutException("timeout")

    generator = DeepSeekGenerator(api_key="test-key", client=TimeoutClient())

    with pytest.raises(DeepSeekGenerationError):
        generator.generate(GenerateRequest(title="RSC", content="内容"))


def test_from_environment_reads_local_dotenv_without_overriding_process_environment(tmp_path, monkeypatch):
    dotenv_path = tmp_path / ".env"
    dotenv_path.write_text(
        "DEEPSEEK_API_KEY=file-key\n"
        "DEEPSEEK_BASE_URL=https://deepseek.example\n"
        "DEEPSEEK_MODEL=file-model\n",
        encoding="utf-8",
    )
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    monkeypatch.setenv("DEEPSEEK_MODEL", "environment-model")

    generator = DeepSeekGenerator.from_environment(dotenv_path=dotenv_path)

    assert generator.api_key == "file-key"
    assert generator.base_url == "https://deepseek.example"
    assert generator.model == "environment-model"


def test_from_environment_prefers_shared_settings_file(tmp_path, monkeypatch):
    path = tmp_path / "llm.json"
    path.write_text(
        json.dumps(
            {
                "apiKey": "saved",
                "baseUrl": "https://proxy.example/v1",
                "model": "saved-model",
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setenv("LEARNING_OS_LLM_CONFIG_PATH", str(path))
    monkeypatch.setenv("DEEPSEEK_API_KEY", "ignored")

    generator = DeepSeekGenerator.from_environment()

    assert generator.api_key == "saved"
    assert generator.base_url == "https://proxy.example/v1"
    assert generator.model == "saved-model"


@pytest.mark.parametrize(
    "content",
    [
        None,
        "{not-json",
        json.dumps({"apiKey": 1, "baseUrl": "https://proxy.example", "model": "saved-model"}),
        json.dumps({"apiKey": "saved", "baseUrl": 1, "model": "saved-model"}),
        json.dumps({"apiKey": "saved", "baseUrl": "https://proxy.example", "model": 1}),
        json.dumps({"baseUrl": "https://proxy.example", "model": "saved-model"}),
    ],
)
def test_from_environment_treats_invalid_shared_settings_as_unconfigured(tmp_path, monkeypatch, content):
    path = tmp_path / "llm.json"
    if content is not None:
        path.write_text(content, encoding="utf-8")
    monkeypatch.setenv("LEARNING_OS_LLM_CONFIG_PATH", str(path))
    monkeypatch.setenv("DEEPSEEK_API_KEY", "ignored")
    monkeypatch.setenv("DEEPSEEK_BASE_URL", "https://ignored.example")
    monkeypatch.setenv("DEEPSEEK_MODEL", "ignored-model")

    generator = DeepSeekGenerator.from_environment()

    with pytest.raises(DeepSeekNotConfiguredError):
        generator.test_connection()


def test_test_connection_posts_small_non_streaming_request():
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["request"] = request
        return httpx.Response(200)

    generator = DeepSeekGenerator(
        api_key="key",
        base_url="https://proxy.example/v1",
        model="saved-model",
        client=httpx.Client(transport=httpx.MockTransport(handler)),
    )

    generator.test_connection()

    request = captured["request"]
    assert str(request.url) == "https://proxy.example/v1/chat/completions"
    assert request.headers["authorization"] == "Bearer key"
    assert json.loads(request.content) == {
        "model": "saved-model",
        "messages": [{"role": "user", "content": "ping"}],
        "thinking": {"type": "disabled"},
        "max_tokens": 1,
        "stream": False,
    }


@pytest.mark.parametrize("status_code", [401, 500])
def test_test_connection_normalizes_upstream_http_errors(status_code):
    generator = DeepSeekGenerator(
        api_key="key",
        client=httpx.Client(transport=httpx.MockTransport(lambda _: httpx.Response(status_code))),
    )

    with pytest.raises(DeepSeekGenerationError):
        generator.test_connection()


def test_test_connection_normalizes_timeout_errors():
    class TimeoutClient:
        def post(self, *_args, **_kwargs):
            raise httpx.TimeoutException("timeout")

    generator = DeepSeekGenerator(api_key="key", client=TimeoutClient())

    with pytest.raises(DeepSeekGenerationError):
        generator.test_connection()


def test_test_connection_normalizes_invalid_response_format():
    class InvalidResponseClient:
        def post(self, *_args, **_kwargs):
            return object()

    generator = DeepSeekGenerator(api_key="key", client=InvalidResponseClient())

    with pytest.raises(DeepSeekGenerationError):
        generator.test_connection()

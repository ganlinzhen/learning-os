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

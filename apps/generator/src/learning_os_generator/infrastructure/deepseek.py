import json
import os
from pathlib import Path

import httpx
from dotenv import dotenv_values
from pydantic import ValidationError

from learning_os_generator.schemas.generation import GenerateRequest, GenerateResponse


class DeepSeekNotConfiguredError(Exception):
    """DeepSeek API Key 未配置。"""


class DeepSeekGenerationError(Exception):
    """DeepSeek 调用或响应校验失败。"""


class DeepSeekGenerator:
    def __init__(
        self,
        api_key: str | None,
        client: httpx.Client | None = None,
        base_url: str = "https://api.deepseek.com",
        model: str = "deepseek-v4-flash",
    ) -> None:
        self.api_key = api_key
        self.client = client or httpx.Client(timeout=30.0)
        self.base_url = base_url.rstrip("/")
        self.model = model

    @classmethod
    def from_environment(cls, dotenv_path: Path | None = None) -> "DeepSeekGenerator":
        config_path = os.environ.get("LEARNING_OS_LLM_CONFIG_PATH")
        if config_path:
            return cls._from_shared_settings(Path(config_path))

        values = dotenv_values(dotenv_path or Path(__file__).resolve().parents[3] / ".env")

        def value(name: str, default: str | None = None) -> str | None:
            return os.environ[name] if name in os.environ else values.get(name, default)

        return cls(
            api_key=value("DEEPSEEK_API_KEY"),
            base_url=value("DEEPSEEK_BASE_URL", "https://api.deepseek.com") or "https://api.deepseek.com",
            model=value("DEEPSEEK_MODEL", "deepseek-v4-flash") or "deepseek-v4-flash",
        )

    @classmethod
    def _from_shared_settings(cls, path: Path) -> "DeepSeekGenerator":
        try:
            settings = json.loads(path.read_text(encoding="utf-8"))
            if not isinstance(settings, dict):
                raise ValueError("invalid_settings")

            api_key = settings.get("apiKey")
            base_url = settings.get("baseUrl")
            model = settings.get("model")
            if any(value is not None and not isinstance(value, str) for value in (api_key, base_url, model)):
                raise ValueError("invalid_settings")

            return cls(
                api_key=api_key.strip() if api_key else None,
                base_url=base_url or "https://api.deepseek.com",
                model=model or "deepseek-v4-flash",
            )
        except (OSError, json.JSONDecodeError, TypeError, ValueError):
            return cls(api_key=None)

    def generate(self, request: GenerateRequest) -> GenerateResponse:
        if not self.api_key:
            raise DeepSeekNotConfiguredError()

        try:
            response = self.client.post(
                f"{self.base_url}/chat/completions",
                headers={"authorization": f"Bearer {self.api_key}"},
                json={
                    "model": self.model,
                    "messages": self._build_messages(request),
                    "response_format": {"type": "json_object"},
                    "thinking": {"type": "disabled"},
                    "max_tokens": 4096,
                    "stream": False,
                },
            )
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"]
            if not isinstance(content, str) or not content.strip():
                raise ValueError("empty_content")
            return GenerateResponse.model_validate(json.loads(content))
        except (httpx.HTTPError, KeyError, IndexError, RuntimeError, TypeError, ValueError, ValidationError) as error:
            raise DeepSeekGenerationError() from error

    def test_connection(self) -> None:
        if not self.api_key:
            raise DeepSeekNotConfiguredError()

        try:
            response = self.client.post(
                f"{self.base_url}/chat/completions",
                headers={"authorization": f"Bearer {self.api_key}"},
                json={
                    "model": self.model,
                    "messages": [{"role": "user", "content": "ping"}],
                    "thinking": {"type": "disabled"},
                    "max_tokens": 1,
                    "stream": False,
                },
            )
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"]
            if not isinstance(content, str) or not content.strip():
                raise ValueError("empty_content")
        except (httpx.HTTPError, AttributeError, KeyError, IndexError, RuntimeError, TypeError, ValueError) as error:
            raise DeepSeekGenerationError() from error

    @staticmethod
    def _build_messages(request: GenerateRequest) -> list[dict[str, str]]:
        return [
            {
                "role": "system",
                "content": (
                    "你是学习内容整理助手。请仅输出合法 JSON，不要输出 Markdown 或额外文字。"
                    "JSON 必须符合以下结构："
                    '{"coreConcepts":[{"title":"","summary":"","evidence":"","isCore":true,'
                    '"isSelected":true,"cards":[{"type":"qa","question":"","answer":"",'
                    '"explanation":"","isSelected":true}]}],"candidateConcepts":[]}。'
                    "提取核心知识点及必要的候选知识点，并为每个知识点生成可复习的问答卡片。"
                ),
            },
            {
                "role": "user",
                "content": f"标题：{request.title}\n\n正文：\n{request.content}",
            },
        ]

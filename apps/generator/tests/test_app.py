import json

import httpx
import pytest
from fastapi.testclient import TestClient

from learning_os_generator.api.app import app, get_generator
from learning_os_generator.infrastructure.deepseek import DeepSeekGenerator


@pytest.fixture(autouse=True)
def clear_dependency_overrides():
    app.dependency_overrides.clear()
    yield
    app.dependency_overrides.clear()


def test_generate_returns_deepseek_candidates():
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": json.dumps(
                                {
                                    "coreConcepts": [
                                        {
                                            "title": "React Server Components",
                                            "summary": "组件可在服务端执行。",
                                            "cards": [],
                                        }
                                    ],
                                    "candidateConcepts": [],
                                }
                            )
                        }
                    }
                ]
            },
        )

    app.dependency_overrides[get_generator] = lambda: DeepSeekGenerator(
        api_key="test-key",
        client=httpx.Client(transport=httpx.MockTransport(handler)),
    )

    response = TestClient(app).post(
        "/generate",
        json={"title": "React Server Components", "content": "RSC allows server rendering."},
    )

    assert response.status_code == 200
    assert response.json()["coreConcepts"][0]["title"] == "React Server Components"


def test_generate_returns_503_when_deepseek_key_is_missing():
    app.dependency_overrides[get_generator] = lambda: DeepSeekGenerator(api_key=None)

    response = TestClient(app).post("/generate", json={"title": "RSC", "content": "内容"})

    assert response.status_code == 503
    assert response.json() == {"detail": "deepseek_not_configured"}


def test_generate_returns_502_when_deepseek_generation_fails():
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(500)

    app.dependency_overrides[get_generator] = lambda: DeepSeekGenerator(
        api_key="test-key",
        client=httpx.Client(transport=httpx.MockTransport(handler)),
    )

    response = TestClient(app).post("/generate", json={"title": "RSC", "content": "内容"})

    assert response.status_code == 502
    assert response.json() == {"detail": "deepseek_generation_failed"}


def test_test_connection_returns_ok():
    app.dependency_overrides[get_generator] = lambda: DeepSeekGenerator(
        api_key="test-key",
        client=httpx.Client(transport=httpx.MockTransport(lambda _: httpx.Response(200))),
    )

    response = TestClient(app).post("/test-connection")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_test_connection_returns_503_when_deepseek_key_is_missing():
    app.dependency_overrides[get_generator] = lambda: DeepSeekGenerator(api_key=None)

    response = TestClient(app).post("/test-connection")

    assert response.status_code == 503
    assert response.json() == {"detail": "deepseek_not_configured"}


def test_test_connection_returns_502_when_upstream_fails():
    app.dependency_overrides[get_generator] = lambda: DeepSeekGenerator(
        api_key="test-key",
        client=httpx.Client(transport=httpx.MockTransport(lambda _: httpx.Response(500))),
    )

    response = TestClient(app).post("/test-connection")

    assert response.status_code == 502
    assert response.json() == {"detail": "deepseek_generation_failed"}

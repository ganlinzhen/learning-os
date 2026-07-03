from fastapi.testclient import TestClient

from learning_os_generator.api.app import app

client = TestClient(app)


def test_generate_candidates_returns_core_and_candidate_items():
    response = client.post(
        "/generate",
        json={"title": "React Server Components", "content": "RSC allows server rendering."},
    )

    payload = response.json()
    assert response.status_code == 200
    assert payload["coreConcepts"][0]["title"] == "React Server Components"
    assert "candidateConcepts" in payload

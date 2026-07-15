from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException

from learning_os_generator.infrastructure.deepseek import (
    DeepSeekGenerationError,
    DeepSeekGenerator,
    DeepSeekNotConfiguredError,
)
from learning_os_generator.schemas.generation import GenerateRequest, GenerateResponse

app = FastAPI(title="Learning OS Generator")


def get_generator() -> DeepSeekGenerator:
    return DeepSeekGenerator.from_environment()


@app.post("/generate", response_model=GenerateResponse)
def generate(
    request: GenerateRequest,
    generator: Annotated[DeepSeekGenerator, Depends(get_generator)],
) -> GenerateResponse:
    try:
        return generator.generate(request)
    except DeepSeekNotConfiguredError as error:
        raise HTTPException(status_code=503, detail="deepseek_not_configured") from error
    except DeepSeekGenerationError as error:
        raise HTTPException(status_code=502, detail="deepseek_generation_failed") from error


@app.post("/test-connection")
def test_connection(
    generator: Annotated[DeepSeekGenerator, Depends(get_generator)],
) -> dict[str, str]:
    try:
        generator.test_connection()
        return {"status": "ok"}
    except DeepSeekNotConfiguredError as error:
        raise HTTPException(status_code=503, detail="deepseek_not_configured") from error
    except DeepSeekGenerationError as error:
        raise HTTPException(status_code=502, detail="deepseek_generation_failed") from error

from fastapi import FastAPI

from learning_os_generator.domain.generation import generate_candidates
from learning_os_generator.schemas.generation import GenerateRequest, GenerateResponse

app = FastAPI(title="Learning OS Generator")


@app.post("/generate", response_model=GenerateResponse)
def generate(request: GenerateRequest) -> GenerateResponse:
    return generate_candidates(request)

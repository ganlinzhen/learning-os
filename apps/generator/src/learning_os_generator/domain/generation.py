from learning_os_generator.schemas.generation import CardCandidate, ConceptCandidate, GenerateRequest, GenerateResponse


def sentence_summary(content: str) -> list[str]:
    sentences = [item.strip() for item in content.replace("\n", " ").split("。") if item.strip()]
    if not sentences:
        sentences = [content.strip()]
    return [item for item in sentences if item][:3]


def generate_candidates(request: GenerateRequest) -> GenerateResponse:
    snippets = sentence_summary(request.content)
    core_summary = snippets[0] if snippets else request.content[:120]
    core_concept = ConceptCandidate(
        title=request.title,
        summary=core_summary[:120],
        evidence=core_summary[:160],
        isCore=True,
        isSelected=True,
        cards=[
            CardCandidate(
                type="qa",
                question=f"{request.title} 是什么？",
                answer=core_summary[:180],
                explanation="根据导入内容自动生成的第一版问答卡片。",
            )
        ],
    )

    candidate_concepts = []
    for index, snippet in enumerate(snippets[1:], start=1):
        candidate_concepts.append(
            ConceptCandidate(
                title=f"{request.title} - 要点 {index}",
                summary=snippet[:120],
                evidence=snippet[:160],
                isCore=False,
                isSelected=False,
                cards=[
                    CardCandidate(
                        type="qa",
                        question=f"{request.title} 的要点 {index} 是什么？",
                        answer=snippet[:180],
                    )
                ],
            )
        )

    return GenerateResponse(coreConcepts=[core_concept], candidateConcepts=candidate_concepts)

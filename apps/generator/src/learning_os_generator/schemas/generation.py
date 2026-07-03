from typing import Literal

from pydantic import BaseModel, Field


class GenerateRequest(BaseModel):
    title: str
    content: str


class CardCandidate(BaseModel):
    type: Literal["qa", "cloze"] = "qa"
    question: str
    answer: str
    explanation: str = ""
    isSelected: bool = True


class ConceptCandidate(BaseModel):
    title: str
    summary: str
    evidence: str = ""
    isCore: bool = False
    isSelected: bool = False
    cards: list[CardCandidate] = Field(default_factory=list)


class GenerateResponse(BaseModel):
    coreConcepts: list[ConceptCandidate]
    candidateConcepts: list[ConceptCandidate]

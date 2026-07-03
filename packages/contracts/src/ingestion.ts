export const ingestionSessionStatuses = [
  "created",
  "processing",
  "reviewable",
  "confirmed",
  "imported",
  "failed",
  "discarded",
] as const;

export type IngestionSessionStatus = (typeof ingestionSessionStatuses)[number];

export interface CardCandidateDto {
  id: string;
  conceptCandidateId?: string;
  type: "qa" | "cloze";
  question: string;
  answer: string;
  explanation?: string;
  isSelected: boolean;
}

export interface ConceptCandidateDto {
  id: string;
  title: string;
  summary: string;
  evidence?: string;
  isCore: boolean;
  isSelected: boolean;
  cards: CardCandidateDto[];
}

export interface IngestionDetailDto {
  sessionId: string;
  sourceId: string;
  title: string;
  sourceType: "text" | "url" | "markdown";
  status: IngestionSessionStatus;
  coreConcepts: ConceptCandidateDto[];
  candidateConcepts: ConceptCandidateDto[];
}

export interface CreateImportDto {
  type: "text" | "url" | "markdown";
  title: string;
  content: string;
  url?: string;
}

export interface ConfirmIngestionDto {
  selectedCandidateIds: string[];
  selectedCardIds?: string[];
}

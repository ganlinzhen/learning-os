import type { ConfirmIngestionDto as ConfirmIngestionInput } from "@learning-os/contracts";

export class ConfirmIngestionDto implements ConfirmIngestionInput {
  selectedCandidateIds!: string[];
  selectedCardIds?: string[];
}

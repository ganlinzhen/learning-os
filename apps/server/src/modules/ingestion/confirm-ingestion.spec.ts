import { describe, expect, it, vi } from "vitest";
import { IngestionService } from "./ingestion.service";

describe("confirmIngestion", () => {
  it("imports selected concept candidates into concept table", async () => {
    const prisma = {
      conceptCandidate: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "cand_1",
            title: "RSC",
            summary: "summary",
            evidence: "evidence",
            isSelected: true,
            cards: [
              {
                id: "card_1",
                type: "qa",
                question: "RSC 是什么？",
                answer: "summary",
                explanation: "",
                isSelected: true,
              },
            ],
          },
        ]),
      },
      concept: { create: vi.fn().mockResolvedValue({ id: "concept_1" }) },
      reviewCard: { create: vi.fn().mockResolvedValue({ id: "review_1" }) },
      ingestionSession: { update: vi.fn() },
    } as any;

    const result = await new IngestionService(prisma, {} as any, {} as any).confirmIngestion(
      "session_1",
      {
        selectedCandidateIds: ["cand_1"],
      },
    );

    expect(result.importedConceptCount).toBe(1);
  });
});

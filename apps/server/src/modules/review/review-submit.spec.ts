import { describe, expect, it, vi } from "vitest";
import { ReviewService } from "./review.service";

describe("submitAnswer", () => {
  it("updates due date and creates review log", async () => {
    const prisma = {
      reviewCard: {
        findUnique: vi.fn().mockResolvedValue({
          id: "card_1",
          conceptId: "concept_1",
          dueAt: new Date(),
          reps: 0,
          lapses: 0,
          stability: 0,
          difficultyFsrs: 0,
          elapsedDays: 0,
          scheduledDays: 0,
        }),
        update: vi.fn().mockResolvedValue({ id: "card_1" }),
      },
      reviewLog: { create: vi.fn() },
    } as any;

    const service = new ReviewService(prisma);
    await service.submitAnswer("card_1", "good");

    expect(prisma.reviewLog.create).toHaveBeenCalled();
    expect(prisma.reviewCard.update).toHaveBeenCalled();
  });
});

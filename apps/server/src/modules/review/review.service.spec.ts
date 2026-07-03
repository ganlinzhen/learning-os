import { describe, expect, it, vi } from "vitest";
import { ReviewService } from "./review.service";

describe("ReviewService", () => {
  it("returns due cards ordered by dueAt", async () => {
    const prisma = {
      reviewCard: {
        findMany: vi.fn().mockResolvedValue([{ id: "card_1", question: "RSC 是什么？" }]),
      },
    } as any;

    const service = new ReviewService(prisma);
    const cards = await service.getTodayCards();
    expect(cards[0].id).toBe("card_1");
  });
});

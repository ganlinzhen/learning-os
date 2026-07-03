import { describe, expect, it, vi } from "vitest";
import { SearchService } from "./search.service";

describe("SearchService", () => {
  it("returns imported concepts by keyword", async () => {
    const prisma = {
      concept: {
        findMany: vi.fn().mockResolvedValue([{ id: "1", title: "RSC", summary: "summary" }]),
      },
    } as any;

    const service = new SearchService(prisma);
    const results = await service.search("RSC");
    expect(results).toHaveLength(1);
  });
});

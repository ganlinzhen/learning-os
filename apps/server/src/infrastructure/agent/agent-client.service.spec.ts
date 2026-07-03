import { describe, expect, it, vi } from "vitest";
import { AgentClientService } from "./agent-client.service";

describe("AgentClientService", () => {
  it("returns normalized candidate payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        coreConcepts: [{ title: "RSC", summary: "summary", cards: [] }],
        candidateConcepts: [],
      }),
    });

    const service = new AgentClientService(undefined, {
      fetchImpl: fetchMock as any,
      baseUrl: "http://localhost:8000",
    });
    const result = await service.generateCandidates({ title: "RSC", content: "body" });
    expect(result.coreConcepts[0].title).toBe("RSC");
  });
});

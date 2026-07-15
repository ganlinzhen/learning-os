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

  it("posts connection tests to the resolved generator endpoint without a body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    const service = new AgentClientService(undefined, {
      fetchImpl: fetchMock as any,
      baseUrl: "http://127.0.0.1:8000",
    });

    await service.testLlmConnection();

    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:8000/test-connection", { method: "POST" });
  });

  it("保留 Generator 返回的稳定连接错误码", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ detail: "deepseek_auth_failed" }),
    });
    const service = new AgentClientService(undefined, { fetchImpl: fetchMock as any, baseUrl: "http://127.0.0.1:8000" });

    await expect(service.testLlmConnection()).rejects.toMatchObject({ code: "deepseek_auth_failed" });
  });
});

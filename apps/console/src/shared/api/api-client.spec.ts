import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "./api-client";

describe("apiClient", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ sessionId: "session_1", status: "processing" }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("通过重试端点重新启动失败的导入", async () => {
    await apiClient.retryIngestion("session_1");

    expect(fetch).toHaveBeenCalledWith("http://127.0.0.1:3000/ingestions/session_1/retry", {
      headers: { "content-type": "application/json" },
      method: "POST",
    });
  });
});

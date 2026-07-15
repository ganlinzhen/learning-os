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

  it("调用 LLM 设置接口", async () => {
    const input = { apiKey: "new-key", baseUrl: "https://api.deepseek.com", model: "deepseek-v4-flash" };

    await apiClient.getLlmSettings();
    await apiClient.saveLlmSettings(input);
    await apiClient.testLlmSettings(input);
    await apiClient.clearLlmApiKey();

    expect(fetch).toHaveBeenNthCalledWith(1, "http://127.0.0.1:3000/settings/llm", {
      headers: { "content-type": "application/json" },
    });
    expect(fetch).toHaveBeenNthCalledWith(2, "http://127.0.0.1:3000/settings/llm", {
      headers: { "content-type": "application/json" },
      method: "PUT",
      body: JSON.stringify(input),
    });
    expect(fetch).toHaveBeenNthCalledWith(3, "http://127.0.0.1:3000/settings/llm/test", {
      headers: { "content-type": "application/json" },
      method: "POST",
      body: JSON.stringify(input),
    });
    expect(fetch).toHaveBeenNthCalledWith(4, "http://127.0.0.1:3000/settings/llm/api-key", {
      headers: { "content-type": "application/json" },
      method: "DELETE",
    });
  });

  it("通过桌面预加载桥接为设置写入附加令牌", async () => {
    window.learningOsDesktop = { getApiToken: vi.fn().mockResolvedValue("desktop-token") };

    await apiClient.saveLlmSettings({ baseUrl: "https://api.deepseek.com", model: "deepseek-v4-flash" });

    expect(fetch).toHaveBeenCalledWith("http://127.0.0.1:3000/settings/llm", {
      headers: { "content-type": "application/json", "x-learning-os-token": "desktop-token" },
      method: "PUT",
      body: JSON.stringify({ baseUrl: "https://api.deepseek.com", model: "deepseek-v4-flash" }),
    });
    delete window.learningOsDesktop;
  });
});

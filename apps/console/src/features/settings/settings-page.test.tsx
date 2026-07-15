import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "../../shared/api/api-client";
import { SettingsPage } from "./settings-page";

vi.mock("../../shared/api/api-client", () => ({
  apiClient: {
    getLlmSettings: vi.fn(),
    saveLlmSettings: vi.fn(),
    testLlmSettings: vi.fn(),
    clearLlmApiKey: vi.fn(),
  },
}));

const configuredSettings = {
  provider: "deepseek" as const,
  apiKeyConfigured: true,
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-v4-flash",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.mocked(apiClient.getLlmSettings).mockReset();
    vi.mocked(apiClient.saveLlmSettings).mockReset();
    vi.mocked(apiClient.testLlmSettings).mockReset();
    vi.mocked(apiClient.clearLlmApiKey).mockReset();
    vi.mocked(apiClient.getLlmSettings).mockResolvedValue(configuredSettings);
  });

  it("加载后显示设置分组和已配置的密钥状态", async () => {
    render(<SettingsPage />);

    expect(screen.getByText("正在读取配置…")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "设置" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "LLM 配置" })).toBeInTheDocument();
    expect(screen.getByText("已配置")).toBeInTheDocument();
    expect(screen.getByLabelText("API Key")).toHaveValue("");
    expect(screen.getByText("出于安全考虑，已保存的密钥不会再次显示。")).toBeInTheDocument();
  });

  it("保存空 API Key 时保留已有密钥", async () => {
    vi.mocked(apiClient.saveLlmSettings).mockResolvedValueOnce(configuredSettings);
    render(<SettingsPage />);

    await screen.findByRole("button", { name: "保存配置" });
    fireEvent.click(screen.getByRole("button", { name: "保存配置" }));

    await waitFor(() => {
      expect(apiClient.saveLlmSettings).toHaveBeenCalledWith({
        baseUrl: "https://api.deepseek.com",
        model: "deepseek-v4-flash",
      });
    });
    expect(await screen.findByRole("status")).toHaveTextContent("配置已保存。");
  });

  it("保存并测试连接会提交新输入的密钥", async () => {
    vi.mocked(apiClient.testLlmSettings).mockResolvedValueOnce(configuredSettings);
    render(<SettingsPage />);

    await screen.findByRole("button", { name: "保存并测试连接" });
    fireEvent.change(screen.getByLabelText("API Key"), { target: { value: "new-key" } });
    fireEvent.click(screen.getByRole("button", { name: "保存并测试连接" }));

    await waitFor(() => {
      expect(apiClient.testLlmSettings).toHaveBeenCalledWith({
        apiKey: "new-key",
        baseUrl: "https://api.deepseek.com",
        model: "deepseek-v4-flash",
      });
    });
    expect(await screen.findByRole("status")).toHaveTextContent("连接测试成功。");
  });

  it("测试失败时展示可操作的错误提示", async () => {
    vi.mocked(apiClient.testLlmSettings).mockRejectedValueOnce(new Error("request_failed:/settings/llm/test"));
    render(<SettingsPage />);

    await screen.findByRole("button", { name: "保存并测试连接" });
    fireEvent.click(screen.getByRole("button", { name: "保存并测试连接" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("连接测试失败，请检查 API Key、地址和模型名称后重试。");
  });

  it("无效字段会在提交前显示就近提示", async () => {
    render(<SettingsPage />);

    await screen.findByRole("button", { name: "保存配置" });
    fireEvent.change(screen.getByLabelText("Base URL"), { target: { value: "invalid-url" } });
    fireEvent.change(screen.getByLabelText("模型名称"), { target: { value: " " } });
    fireEvent.click(screen.getByRole("button", { name: "保存配置" }));

    expect(await screen.findByText("请输入有效的 HTTP(S) 地址。")).toBeInTheDocument();
    expect(screen.getByText("请输入模型名称。")).toBeInTheDocument();
    expect(apiClient.saveLlmSettings).not.toHaveBeenCalled();
  });

  it("提交期间禁用两个保存操作", async () => {
    const saving = deferred<typeof configuredSettings>();
    vi.mocked(apiClient.saveLlmSettings).mockReturnValueOnce(saving.promise);
    render(<SettingsPage />);

    await screen.findByRole("button", { name: "保存配置" });
    fireEvent.click(screen.getByRole("button", { name: "保存配置" }));

    expect(screen.getByRole("button", { name: "保存中…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "保存并测试连接" })).toBeDisabled();
    saving.resolve(configuredSettings);
    await screen.findByRole("status");
  });

  it("清除密钥前需要确认，并在确认后更新状态", async () => {
    vi.mocked(apiClient.clearLlmApiKey).mockResolvedValueOnce({ ...configuredSettings, apiKeyConfigured: false });
    render(<SettingsPage />);

    await screen.findByRole("button", { name: "清除 API Key" });
    fireEvent.click(screen.getByRole("button", { name: "清除 API Key" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "确认清除" }));
    await waitFor(() => expect(apiClient.clearLlmApiKey).toHaveBeenCalledOnce());
    expect(await screen.findByText("未配置")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

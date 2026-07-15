import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
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

const originalShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");
const showModal = vi.fn(function (this: HTMLDialogElement) {
  this.setAttribute("open", "");
});
const close = vi.fn(function (this: HTMLDialogElement) {
  this.removeAttribute("open");
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

describe("SettingsPage", () => {
  beforeEach(() => {
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: showModal });
    Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: close });
    showModal.mockClear();
    close.mockClear();
    vi.mocked(apiClient.getLlmSettings).mockReset();
    vi.mocked(apiClient.saveLlmSettings).mockReset();
    vi.mocked(apiClient.testLlmSettings).mockReset();
    vi.mocked(apiClient.clearLlmApiKey).mockReset();
    vi.mocked(apiClient.getLlmSettings).mockResolvedValue(configuredSettings);
  });

  afterAll(() => {
    if (originalShowModal) {
      Object.defineProperty(HTMLDialogElement.prototype, "showModal", originalShowModal);
    } else {
      delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).showModal;
    }
    if (originalClose) {
      Object.defineProperty(HTMLDialogElement.prototype, "close", originalClose);
    } else {
      delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).close;
    }
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
    const failure = Object.assign(new Error("request_failed:/settings/llm/test"), {
      code: "deepseek_auth_failed",
      settings: { ...configuredSettings, apiKeyConfigured: true },
    });
    vi.mocked(apiClient.getLlmSettings).mockResolvedValueOnce({ ...configuredSettings, apiKeyConfigured: false });
    vi.mocked(apiClient.testLlmSettings).mockRejectedValueOnce(failure);
    render(<SettingsPage />);

    await screen.findByRole("button", { name: "保存并测试连接" });
    fireEvent.change(screen.getByLabelText("API Key"), { target: { value: "new-key" } });
    fireEvent.click(screen.getByRole("button", { name: "保存并测试连接" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("API Key 无效或没有访问权限。");
    expect(screen.getByText("已配置")).toBeInTheDocument();
  });

  it("拒绝非 HTTP(S) 的 Base URL", async () => {
    render(<SettingsPage />);

    await screen.findByRole("button", { name: "保存配置" });
    fireEvent.change(screen.getByLabelText("Base URL"), { target: { value: "ftp://api.deepseek.com" } });
    fireEvent.click(screen.getByRole("button", { name: "保存配置" }));

    expect(await screen.findByText("请输入有效的 HTTP(S) 地址。")).toBeInTheDocument();
    expect(screen.getByLabelText("Base URL")).toHaveAttribute("aria-invalid", "true");
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

  it("以原生模态对话框确认清除，并响应取消事件", async () => {
    render(<SettingsPage />);

    await screen.findByRole("button", { name: "清除 API Key" });
    fireEvent.click(screen.getByRole("button", { name: "清除 API Key" }));
    const dialog = screen.getByRole("dialog");
    expect(showModal).toHaveBeenCalledOnce();
    expect(dialog).toHaveAttribute("open");

    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(dialog).not.toHaveAttribute("open");
  });

  it("清除密钥失败时在仍打开的对话框中展示错误", async () => {
    vi.mocked(apiClient.clearLlmApiKey).mockRejectedValueOnce(new Error("request_failed:/settings/llm/api-key"));
    render(<SettingsPage />);

    await screen.findByRole("button", { name: "清除 API Key" });
    fireEvent.click(screen.getByRole("button", { name: "清除 API Key" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "确认清除" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("清除 API Key 失败，请稍后重试。");
    expect(dialog).toHaveAttribute("open");
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

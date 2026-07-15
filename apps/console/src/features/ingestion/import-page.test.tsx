import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "../../shared/api/api-client";
import { ImportPage } from "./import-page";

vi.mock("../../shared/api/api-client", () => ({
  apiClient: { createImport: vi.fn() },
}));

describe("ImportPage", () => {
  beforeEach(() => {
    vi.mocked(apiClient.createImport).mockReset();
  });

  const renderPage = () =>
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<ImportPage />} />
          <Route path="/ingestions/:sessionId" element={<p>已进入导入会话</p>} />
        </Routes>
      </MemoryRouter>,
    );

  it("renders import form heading", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "导入中心" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "文本" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "URL" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Markdown" })).toBeInTheDocument();
  });

  it("文本导入仅提交标题和正文并进入会话页", async () => {
    vi.mocked(apiClient.createImport).mockResolvedValueOnce({ sourceId: "source_1", sessionId: "session_1", status: "processing" });
    renderPage();

    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "RSC" } });
    fireEvent.change(screen.getByLabelText("正文"), { target: { value: "正文内容" } });
    fireEvent.click(screen.getByRole("button", { name: "开始整理" }));

    await waitFor(() => {
      expect(apiClient.createImport).toHaveBeenCalledWith({ type: "text", title: "RSC", content: "正文内容" });
    });
    expect(await screen.findByText("已进入导入会话")).toBeInTheDocument();
  });

  it("URL 导入无需正文且不会携带其他模式字段", async () => {
    vi.mocked(apiClient.createImport).mockResolvedValueOnce({ sourceId: "source_1", sessionId: "session_url", status: "processing" });
    renderPage();

    fireEvent.click(screen.getByRole("radio", { name: "URL" }));
    expect(screen.queryByLabelText("正文")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("网页地址"), { target: { value: "https://example.com/article" } });
    fireEvent.click(screen.getByRole("button", { name: "开始整理" }));

    await waitFor(() => {
      expect(apiClient.createImport).toHaveBeenCalledWith({ type: "url", url: "https://example.com/article" });
    });
    expect(await screen.findByText("已进入导入会话")).toBeInTheDocument();
  });

  it("Markdown 导入允许省略标题并提示从一级标题读取", async () => {
    vi.mocked(apiClient.createImport).mockResolvedValueOnce({ sourceId: "source_1", sessionId: "session_md", status: "processing" });
    renderPage();

    fireEvent.click(screen.getByRole("radio", { name: "Markdown" }));
    expect(screen.getByText("未填写标题时，将默认读取 Markdown 的一级标题。")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Markdown 正文"), { target: { value: "# 学习笔记\n正文" } });
    fireEvent.click(screen.getByRole("button", { name: "开始整理" }));

    await waitFor(() => {
      expect(apiClient.createImport).toHaveBeenCalledWith({ type: "markdown", content: "# 学习笔记\n正文" });
    });
  });

  it("shows an actionable error when DeepSeek generation fails", async () => {
    vi.mocked(apiClient.createImport).mockRejectedValueOnce(new Error("request_failed:/ingestions"));

    renderPage();

    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "RSC" } });
    fireEvent.change(screen.getByLabelText("正文"), { target: { value: "内容" } });
    fireEvent.click(screen.getByRole("button", { name: "开始整理" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("导入失败，请检查输入内容或稍后重试。");
    });
  });
});

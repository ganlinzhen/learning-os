import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { apiClient } from "../../shared/api/api-client";
import { ImportPage } from "./import-page";

vi.mock("../../shared/api/api-client", () => ({
  apiClient: { createImport: vi.fn() },
}));

describe("ImportPage", () => {
  it("renders import form heading", () => {
    render(
      <MemoryRouter>
        <ImportPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "导入中心" })).toBeInTheDocument();
  });

  it("shows an actionable error when DeepSeek generation fails", async () => {
    vi.mocked(apiClient.createImport).mockRejectedValueOnce(new Error("request_failed:/ingestions"));

    render(
      <MemoryRouter>
        <ImportPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "RSC" } });
    fireEvent.change(screen.getByLabelText("正文"), { target: { value: "内容" } });
    fireEvent.click(screen.getByRole("button", { name: "开始整理" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("整理失败，请检查 DeepSeek 配置或稍后重试。");
    });
  });
});

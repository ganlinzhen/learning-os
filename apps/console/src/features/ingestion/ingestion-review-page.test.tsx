import type { IngestionDetailDto } from "@learning-os/contracts";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "../../shared/api/api-client";
import { IngestionReviewPage } from "./ingestion-review-page";

vi.mock("../../shared/api/api-client", () => ({
  apiClient: {
    confirmIngestion: vi.fn(),
    getIngestionDetail: vi.fn(),
    retryIngestion: vi.fn(),
  },
}));

const createDetail = (overrides: Partial<IngestionDetailDto> = {}): IngestionDetailDto => ({
  sessionId: "session_1",
  sourceId: "source_1",
  title: "React Server Components",
  sourceType: "text",
  status: "reviewable",
  coreConcepts: [{ id: "1", title: "RSC", summary: "summary", isCore: true, isSelected: true, cards: [] }],
  candidateConcepts: [],
  task: {
    id: "task_1",
    status: "succeeded",
    attemptCount: 1,
    canRetry: false,
  },
  ...overrides,
});

const renderPage = (data?: IngestionDetailDto) =>
  render(
    <MemoryRouter>
      <IngestionReviewPage data={data} />
    </MemoryRouter>,
  );

describe("IngestionReviewPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("仅在可审核状态展示核心与候选知识点", () => {
    renderPage(createDetail());

    expect(screen.getByText("核心知识点")).toBeInTheDocument();
    expect(screen.getByText("候选知识点")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认入库" })).toBeInTheDocument();
    expect(apiClient.getIngestionDetail).not.toHaveBeenCalled();
  });

  it("processing 状态每秒轮询，进入 reviewable 后停止", async () => {
    vi.useFakeTimers();
    vi.mocked(apiClient.getIngestionDetail).mockResolvedValueOnce(createDetail());
    renderPage(
      createDetail({
        status: "processing",
        coreConcepts: [],
        task: { id: "task_1", status: "running", attemptCount: 1, canRetry: false },
      }),
    );

    expect(screen.getByText("正在整理导入内容，请稍候…")).toBeInTheDocument();
    expect(apiClient.getIngestionDetail).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(apiClient.getIngestionDetail).toHaveBeenCalledTimes(1);
    expect(screen.getByText("核心知识点")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(apiClient.getIngestionDetail).toHaveBeenCalledTimes(1);
  });

  it("pending 任务显示等待开始文案", () => {
    renderPage(
      createDetail({
        status: "processing",
        coreConcepts: [],
        task: { id: "task_1", status: "pending", attemptCount: 0, canRetry: false },
      }),
    );

    expect(screen.getByText("导入已创建，正在等待整理任务开始…")).toBeInTheDocument();
  });

  it("失败时显示错误、尝试次数与可用的重试入口", () => {
    renderPage(
      createDetail({
        status: "failed",
        coreConcepts: [],
        task: {
          id: "task_1",
          status: "failed",
          attemptCount: 3,
          lastErrorMessage: "网页内容无法读取",
          canRetry: true,
        },
      }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent("网页内容无法读取");
    expect(screen.getByText("已尝试 3 次")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重试" })).toBeEnabled();
    expect(screen.queryByText("核心知识点")).not.toBeInTheDocument();
    expect(apiClient.getIngestionDetail).not.toHaveBeenCalled();
  });

  it("不可重试时禁用重试按钮并使用默认错误文案", () => {
    renderPage(
      createDetail({
        status: "failed",
        coreConcepts: [],
        task: { id: "task_1", status: "failed", attemptCount: 1, canRetry: false },
      }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent("导入失败，请重试。");
    expect(screen.getByRole("button", { name: "重试" })).toBeDisabled();
  });

  it("重试成功后立即恢复 processing 并继续轮询", async () => {
    vi.useFakeTimers();
    let resolveRetry!: (value: { sessionId: string; status: "processing" }) => void;
    vi.mocked(apiClient.retryIngestion).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRetry = resolve;
      }),
    );
    vi.mocked(apiClient.getIngestionDetail).mockResolvedValueOnce(createDetail());
    renderPage(
      createDetail({
        status: "failed",
        coreConcepts: [],
        task: { id: "task_1", status: "failed", attemptCount: 1, canRetry: true },
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    fireEvent.click(screen.getByRole("button", { name: "正在重试…" }));
    expect(apiClient.retryIngestion).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "正在重试…" })).toBeDisabled();

    await act(async () => {
      resolveRetry({ sessionId: "session_1", status: "processing" });
      await Promise.resolve();
    });
    expect(screen.getByText("正在整理导入内容，请稍候…")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(apiClient.getIngestionDetail).toHaveBeenCalledWith("session_1");
    expect(screen.getByText("核心知识点")).toBeInTheDocument();
  });

  it("重试请求失败时保留入口并展示操作提示", async () => {
    vi.mocked(apiClient.retryIngestion).mockRejectedValueOnce(new Error("request_failed"));
    renderPage(
      createDetail({
        status: "failed",
        coreConcepts: [],
        task: { id: "task_1", status: "failed", attemptCount: 2, canRetry: true },
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "重试" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("重试失败，请稍后再试。");
    expect(screen.getByRole("button", { name: "重试" })).toBeEnabled();
  });

  it("组件卸载后停止轮询并忽略尚未完成的请求", async () => {
    vi.useFakeTimers();
    let resolveDetail!: (value: IngestionDetailDto) => void;
    vi.mocked(apiClient.getIngestionDetail).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveDetail = resolve;
      }),
    );
    const { unmount } = renderPage(
      createDetail({
        status: "processing",
        coreConcepts: [],
        task: { id: "task_1", status: "running", attemptCount: 1, canRetry: false },
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(apiClient.getIngestionDetail).toHaveBeenCalledTimes(1);

    unmount();
    await act(async () => {
      resolveDetail(createDetail({ status: "processing" }));
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(apiClient.getIngestionDetail).toHaveBeenCalledTimes(1);
  });

  it("sessionId 变化时清理旧会话轮询", async () => {
    vi.useFakeTimers();
    vi.mocked(apiClient.getIngestionDetail).mockResolvedValue(createDetail({ status: "processing" }));
    const first = createDetail({
      sessionId: "session_1",
      status: "processing",
      coreConcepts: [],
      task: { id: "task_1", status: "running", attemptCount: 1, canRetry: false },
    });
    const second = createDetail({
      sessionId: "session_2",
      status: "processing",
      coreConcepts: [],
      task: { id: "task_2", status: "running", attemptCount: 1, canRetry: false },
    });
    const { rerender } = renderPage(first);

    rerender(
      <MemoryRouter>
        <IngestionReviewPage data={second} />
      </MemoryRouter>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(apiClient.getIngestionDetail).toHaveBeenCalledTimes(1);
    expect(apiClient.getIngestionDetail).toHaveBeenCalledWith("session_2");
  });

  it("已入库状态显示知识库入口且不展示审核操作", () => {
    renderPage(createDetail({ status: "imported" }));

    expect(screen.getByRole("heading", { name: "已入库" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "前往知识库" })).toHaveAttribute("href", "/library");
    expect(screen.queryByRole("button", { name: "确认入库" })).not.toBeInTheDocument();
    expect(screen.queryByText("核心知识点")).not.toBeInTheDocument();
  });
});

import type { IngestionDetailDto } from "@learning-os/contracts";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "../../shared/api/api-client";
import { IngestionReviewPage } from "./ingestion-review-page";

const navigateMock = vi.hoisted(() => vi.fn());

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

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

const renderPageTree = (data?: IngestionDetailDto) => (
  <MemoryRouter>
    <IngestionReviewPage data={data} />
  </MemoryRouter>
);

const renderPage = (data?: IngestionDetailDto) => render(renderPageTree(data));

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

  it("轮询失败后停止请求，点击重新加载才恢复", async () => {
    vi.useFakeTimers();
    vi.mocked(apiClient.getIngestionDetail)
      .mockRejectedValueOnce(new Error("network_failed"))
      .mockResolvedValueOnce(createDetail());
    renderPage(
      createDetail({
        status: "processing",
        coreConcepts: [],
        task: { id: "task_1", status: "running", attemptCount: 1, canRetry: false },
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(screen.getByRole("alert")).toHaveTextContent("状态更新失败，请点击重新加载。");
    expect(apiClient.getIngestionDetail).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(apiClient.getIngestionDetail).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "重新加载" }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(apiClient.getIngestionDetail).toHaveBeenCalledTimes(2);
    expect(screen.getByText("核心知识点")).toBeInTheDocument();
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

  it("旧会话重试成功后不会覆盖新会话", async () => {
    let resolveRetry!: (value: { sessionId: string; status: "processing" }) => void;
    vi.mocked(apiClient.retryIngestion).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRetry = resolve;
      }),
    );
    const first = createDetail({
      sessionId: "session_1",
      status: "failed",
      coreConcepts: [],
      task: { id: "task_1", status: "failed", attemptCount: 1, canRetry: true },
    });
    const second = createDetail({
      sessionId: "session_2",
      title: "会话 B",
      status: "failed",
      coreConcepts: [],
      task: {
        id: "task_2",
        status: "failed",
        attemptCount: 2,
        lastErrorMessage: "会话 B 导入失败",
        canRetry: true,
      },
    });
    const { rerender } = renderPage(first);

    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    rerender(renderPageTree(second));

    expect(screen.getByRole("button", { name: "重试" })).toBeEnabled();
    await act(async () => {
      resolveRetry({ sessionId: "session_1", status: "processing" });
      await Promise.resolve();
    });

    expect(screen.getByRole("heading", { name: "会话 B" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("会话 B 导入失败");
    expect(screen.queryByText("正在整理导入内容，请稍候…")).not.toBeInTheDocument();
  });

  it("旧会话重试失败后不会把错误写入新会话", async () => {
    let rejectRetry!: (reason: Error) => void;
    vi.mocked(apiClient.retryIngestion).mockReturnValueOnce(
      new Promise((_, reject) => {
        rejectRetry = reject;
      }),
    );
    const first = createDetail({
      sessionId: "session_1",
      status: "failed",
      coreConcepts: [],
      task: { id: "task_1", status: "failed", attemptCount: 1, canRetry: true },
    });
    const second = createDetail({
      sessionId: "session_2",
      title: "会话 B",
      status: "failed",
      coreConcepts: [],
      task: {
        id: "task_2",
        status: "failed",
        attemptCount: 2,
        lastErrorMessage: "会话 B 原始错误",
        canRetry: true,
      },
    });
    const { rerender } = renderPage(first);

    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    rerender(renderPageTree(second));
    await act(async () => {
      rejectRetry(new Error("session_1_failed"));
      await Promise.resolve();
    });

    expect(screen.getByRole("heading", { name: "会话 B" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("会话 B 原始错误");
    expect(screen.getByRole("button", { name: "重试" })).toBeEnabled();
  });

  it("确认入库期间禁用按钮、防止重复提交并展示中文失败提示", async () => {
    let rejectConfirm!: (reason: Error) => void;
    vi.mocked(apiClient.confirmIngestion).mockReturnValue(
      new Promise((_, reject) => {
        rejectConfirm = reject;
      }),
    );
    renderPage(createDetail());

    fireEvent.click(screen.getByRole("button", { name: "确认入库" }));
    const confirmingButton = screen.getByRole("button", { name: "正在入库…" });
    expect(confirmingButton).toBeDisabled();
    fireEvent.click(confirmingButton);
    expect(apiClient.confirmIngestion).toHaveBeenCalledTimes(1);

    await act(async () => {
      rejectConfirm(new Error("request_failed"));
      await Promise.resolve();
    });

    expect(screen.getByRole("alert")).toHaveTextContent("入库失败，请稍后重试。");
    expect(screen.getByRole("button", { name: "确认入库" })).toBeEnabled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("当前会话确认成功后导航到知识库", async () => {
    vi.mocked(apiClient.confirmIngestion).mockResolvedValueOnce({ importedConceptCount: 1 });
    renderPage(createDetail());

    fireEvent.click(screen.getByRole("button", { name: "确认入库" }));

    await act(async () => {
      await Promise.resolve();
    });
    expect(apiClient.confirmIngestion).toHaveBeenCalledWith("session_1", {
      selectedCandidateIds: ["1"],
      selectedCardIds: [],
    });
    expect(navigateMock).toHaveBeenCalledOnce();
    expect(navigateMock).toHaveBeenCalledWith("/library");
  });

  it("旧会话确认成功后不会导航新会话", async () => {
    let resolveConfirm!: (value: { importedConceptCount: number }) => void;
    vi.mocked(apiClient.confirmIngestion).mockReturnValueOnce(
      new Promise<{ importedConceptCount: number }>((resolve) => {
        resolveConfirm = resolve;
      }),
    );
    const { rerender } = renderPage(createDetail({ sessionId: "session_1" }));

    fireEvent.click(screen.getByRole("button", { name: "确认入库" }));
    rerender(renderPageTree(createDetail({ sessionId: "session_2", title: "会话 B" })));
    await act(async () => {
      resolveConfirm({ importedConceptCount: 1 });
      await Promise.resolve();
    });

    expect(screen.getByRole("heading", { name: "会话 B" })).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "确认入库" })).toBeEnabled();
  });

  it("旧会话确认失败后不会把错误写入新会话", async () => {
    let rejectConfirm!: (reason: Error) => void;
    vi.mocked(apiClient.confirmIngestion).mockReturnValueOnce(
      new Promise((_, reject) => {
        rejectConfirm = reject;
      }),
    );
    const { rerender } = renderPage(createDetail({ sessionId: "session_1" }));

    fireEvent.click(screen.getByRole("button", { name: "确认入库" }));
    rerender(renderPageTree(createDetail({ sessionId: "session_2", title: "会话 B" })));
    await act(async () => {
      rejectConfirm(new Error("session_1_failed"));
      await Promise.resolve();
    });

    expect(screen.getByRole("heading", { name: "会话 B" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "确认入库" })).toBeEnabled();
  });

  it("组件卸载后确认成功不会继续导航", async () => {
    let resolveConfirm!: (value: { importedConceptCount: number }) => void;
    vi.mocked(apiClient.confirmIngestion).mockReturnValueOnce(
      new Promise<{ importedConceptCount: number }>((resolve) => {
        resolveConfirm = resolve;
      }),
    );
    const { unmount } = renderPage(createDetail());

    fireEvent.click(screen.getByRole("button", { name: "确认入库" }));
    unmount();
    await act(async () => {
      resolveConfirm({ importedConceptCount: 1 });
      await Promise.resolve();
    });

    expect(navigateMock).not.toHaveBeenCalled();
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

    rerender(renderPageTree(second));
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

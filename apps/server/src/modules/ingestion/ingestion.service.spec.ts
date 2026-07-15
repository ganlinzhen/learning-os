import { BadRequestException } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IngestionService } from "./ingestion.service";

describe("IngestionService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("返回最新失败智能体任务的详情和重试资格", async () => {
    const prisma = {
      ingestionSession: {
        findUnique: vi.fn().mockResolvedValue({
          id: "session_1",
          sourceId: "source_1",
          status: "failed",
          latestAgentTaskId: "task_1",
          source: { title: "RSC", type: "text" },
          candidates: [],
        }),
      },
      agentTask: {
        findUnique: vi.fn().mockResolvedValue({
          id: "task_1",
          status: "failed",
          attemptCount: 2,
          lastErrorCode: "web_fetch_failed",
          lastErrorMessage: "无法获取网页内容",
        }),
      },
    } as any;

    const result = await new IngestionService(prisma, {} as any, {} as any).getIngestionDetail("session_1");

    expect(prisma.agentTask.findUnique).toHaveBeenCalledWith({ where: { id: "task_1" } });
    expect(result.task).toEqual({
      id: "task_1",
      status: "failed",
      attemptCount: 2,
      lastErrorCode: "web_fetch_failed",
      lastErrorMessage: "无法获取网页内容",
      canRetry: true,
    });
  });

  it("为旧版会话返回不可重试的兼容任务摘要", async () => {
    const prisma = {
      ingestionSession: {
        findUnique: vi.fn().mockResolvedValue({
          id: "session_legacy",
          sourceId: "source_1",
          status: "failed",
          source: { title: "旧导入", type: "text" },
          candidates: [],
        }),
      },
      agentTask: { findUnique: vi.fn() },
    } as any;

    const result = await new IngestionService(prisma, {} as any, {} as any).getIngestionDetail("session_legacy");

    expect(prisma.agentTask.findUnique).not.toHaveBeenCalled();
    expect(result.task).toEqual({
      id: "legacy:session_legacy",
      status: "failed",
      attemptCount: 0,
      canRetry: false,
    });
  });

  it("生成器尚未完成时已返回 processing 并创建 pending 任务", async () => {
    let scheduledTask: (() => void) | undefined;
    vi.spyOn(globalThis, "queueMicrotask").mockImplementation((callback) => {
      scheduledTask = callback;
    });
    const prisma = {
      source: { create: vi.fn().mockResolvedValue({ id: "src_1" }) },
      ingestionSession: { create: vi.fn().mockResolvedValue({ id: "session_1" }) },
      agentTask: {
        create: vi.fn().mockResolvedValue({ id: "task_1" }),
        update: vi.fn().mockResolvedValue({ id: "task_1" }),
      },
    } as any;
    const storageService = {
      saveSourceContent: vi.fn().mockResolvedValue({ localPath: "/tmp/RSC.txt", contentHash: "hash_1" }),
      resolveImportContent: vi.fn(),
    } as any;
    const agentClient = { generateCandidates: vi.fn(() => new Promise(() => undefined)) } as any;

    const result = await new IngestionService(prisma, storageService, agentClient).createImport({
      type: "text",
      title: "RSC",
      content: "server components",
    });

    expect(result).toEqual({ sourceId: "src_1", sessionId: "session_1", status: "processing" });
    expect(prisma.agentTask.create).toHaveBeenCalledWith({
      data: { type: "ingestion", status: "pending", attemptCount: 1 },
    });
    expect(prisma.agentTask.update).toHaveBeenCalledWith({
      where: { id: "task_1" },
      data: { sessionId: "session_1" },
    });
    expect(scheduledTask).toBeTypeOf("function");
    expect(agentClient.generateCandidates).not.toHaveBeenCalled();
  });

  it.each([
    { type: "url" as const, url: "https://example.com", expectedInitialTitle: "" },
    { type: "markdown" as const, content: "# Markdown 标题\n\n正文", expectedInitialTitle: "" },
  ])("接受 $type 导入并保存原始来源", async (input) => {
    vi.spyOn(globalThis, "queueMicrotask").mockImplementation(() => undefined);
    const prisma = {
      source: { create: vi.fn().mockResolvedValue({ id: "src_1" }) },
      ingestionSession: { create: vi.fn().mockResolvedValue({ id: "session_1" }) },
      agentTask: {
        create: vi.fn().mockResolvedValue({ id: "task_1" }),
        update: vi.fn().mockResolvedValue({ id: "task_1" }),
      },
    } as any;
    const storageService = {
      saveSourceContent: vi.fn().mockResolvedValue({ localPath: "/tmp/source.txt", contentHash: "hash_1" }),
    } as any;

    await expect(new IngestionService(prisma, storageService, {} as any).createImport(input)).resolves.toMatchObject({
      status: "processing",
    });
    expect(prisma.source.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: input.type,
        title: input.expectedInitialTitle,
        status: "stored",
      }),
    });
  });

  it("文本导入缺少正文时返回业务错误", async () => {
    const service = new IngestionService({} as any, { saveSourceContent: vi.fn() } as any, {} as any);

    await expect(service.createImport({ type: "text", title: "缺少正文的文本" })).rejects.toThrow(
      BadRequestException,
    );
  });

  it.each([
    ["未知导入类型", { type: "pdf", title: "资料", content: "正文" }],
    ["数字标题", { type: "url", title: 42, url: "https://example.com" }],
    ["URL 导入混入正文", { type: "url", url: "https://example.com", content: "不应出现" }],
    ["Markdown 导入混入 URL", { type: "markdown", content: "# 标题", url: "https://example.com" }],
  ])("%s 时稳定返回 400", async (_name, input) => {
    const storage = { saveSourceContent: vi.fn() };
    const service = new IngestionService({} as any, storage as any, {} as any);

    await expect(service.createImport(input as any)).rejects.toMatchObject({ status: 400 });
    expect(storage.saveSourceContent).not.toHaveBeenCalled();
  });
});

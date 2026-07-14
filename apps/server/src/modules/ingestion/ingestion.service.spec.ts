import { describe, expect, it, vi } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { IngestionService } from "./ingestion.service";

describe("IngestionService", () => {
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

  it("creates source and ingestion session for text import", async () => {
    const prisma = {
      source: { create: vi.fn().mockResolvedValue({ id: "src_1" }) },
      ingestionSession: {
        create: vi.fn().mockResolvedValue({ id: "session_1", status: "created" }),
        update: vi.fn().mockResolvedValue({ id: "session_1", status: "reviewable" }),
      },
      agentTask: {
        create: vi.fn().mockResolvedValue({ id: "task_1" }),
        update: vi.fn().mockResolvedValue({ id: "task_1" }),
      },
      conceptCandidate: { createMany: vi.fn() },
      cardCandidate: { createMany: vi.fn() },
    } as any;

    const storageService = {
      saveSourceContent: vi.fn().mockResolvedValue({
        localPath: "/tmp/RSC.md",
        contentHash: "hash_1",
      }),
    } as any;

    const agentClient = {
      generateCandidates: vi.fn().mockResolvedValue({
        coreConcepts: [],
        candidateConcepts: [],
      }),
    } as any;

    const result = await new IngestionService(prisma, storageService, agentClient).createImport({
      type: "text",
      title: "RSC",
      content: "server components",
    });

    expect(result.sessionId).toBe("session_1");
    expect(prisma.agentTask.update).toHaveBeenNthCalledWith(1, {
      where: { id: "task_1" },
      data: { sessionId: "session_1" },
    });
  });

  it("文本导入缺少正文时返回业务错误", async () => {
    const service = new IngestionService(
      {} as any,
      { saveSourceContent: vi.fn() } as any,
      {} as any,
    );

    await expect(
      service.createImport({
        type: "text",
        title: "缺少正文的文本",
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("URL 导入在当前入口返回业务错误", async () => {
    const service = new IngestionService(
      {} as any,
      { saveSourceContent: vi.fn() } as any,
      {} as any,
    );

    await expect(
      service.createImport({
        type: "url",
        url: "https://example.com",
      }),
    ).rejects.toThrow(BadRequestException);
  });
});

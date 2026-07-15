import { BadRequestException } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { RequestMethod } from "@nestjs/common/enums/request-method.enum";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IngestionController } from "./ingestion.controller";
import { IngestionService } from "./ingestion.service";

const resolvedSource = {
  id: "source_1",
  type: "url",
  title: "",
  content: "",
  url: "https://example.com",
  localPath: "/tmp/original-source.txt",
};

function createRunPrisma() {
  return {
    ingestionSession: {
      findUnique: vi.fn().mockResolvedValue({
        id: "session_1",
        sourceId: "source_1",
        status: "processing",
        latestAgentTaskId: "task_1",
        source: resolvedSource,
      }),
      update: vi.fn().mockResolvedValue({}),
    },
    agentTask: {
      findUnique: vi.fn().mockResolvedValue({ id: "task_1", status: "pending", attemptCount: 1 }),
      update: vi.fn().mockResolvedValue({}),
    },
    claimPendingIngestionTask: vi.fn().mockResolvedValue({
      id: "task_1",
      status: "running",
      attemptCount: 1,
    }),
    source: { update: vi.fn().mockResolvedValue({}) },
    conceptCandidate: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn().mockResolvedValue({ id: "candidate_1" }),
    },
    cardCandidate: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  } as any;
}

describe("runImportTask", () => {
  it("解析来源并保存正文后生成候选，最终把任务和会话设为成功", async () => {
    const prisma = createRunPrisma();
    const storageService = {
      resolveImportContent: vi.fn().mockResolvedValue({
        title: "真实网页标题",
        content: "真实网页正文",
        url: "https://example.com",
      }),
      saveSourceContent: vi.fn().mockResolvedValue({ localPath: "/tmp/new-source.txt", contentHash: "wrong_hash" }),
      replaceSourceContent: vi.fn().mockResolvedValue({
        localPath: "/tmp/original-source.txt",
        contentHash: "new_hash",
      }),
    } as any;
    const agentClient = {
      generateCandidates: vi.fn().mockResolvedValue({
        coreConcepts: [
          {
            title: "新概念",
            summary: "新摘要",
            evidence: "新证据",
            cards: [{ type: "qa", question: "问题", answer: "答案" }],
          },
        ],
        candidateConcepts: [],
      }),
    } as any;

    await new IngestionService(prisma, storageService, agentClient).runImportTask("session_1");

    expect(prisma.claimPendingIngestionTask).toHaveBeenCalledWith("task_1");
    expect(storageService.resolveImportContent).toHaveBeenCalledWith({
      type: "url",
      title: "",
      content: "",
      url: "https://example.com",
    });
    expect(storageService.replaceSourceContent).toHaveBeenCalledWith({
      localPath: "/tmp/original-source.txt",
      content: "真实网页正文",
    });
    expect(storageService.saveSourceContent).not.toHaveBeenCalled();
    expect(prisma.source.update).toHaveBeenCalledWith({
      where: { id: "source_1" },
      data: {
        type: "url",
        title: "真实网页标题",
        content: "真实网页正文",
        url: "https://example.com",
        localPath: "/tmp/original-source.txt",
        contentHash: "new_hash",
        status: "stored",
      },
    });
    expect(prisma.cardCandidate.deleteMany).toHaveBeenCalledWith({ where: { sessionId: "session_1" } });
    expect(prisma.conceptCandidate.deleteMany).toHaveBeenCalledWith({ where: { sessionId: "session_1" } });
    expect(prisma.agentTask.update).toHaveBeenLastCalledWith({
      where: { id: "task_1" },
      data: {
        status: "succeeded",
        finishedAt: expect.any(Date),
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    });
    expect(prisma.ingestionSession.update).toHaveBeenLastCalledWith({
      where: { id: "session_1" },
      data: { status: "reviewable" },
    });
  });

  it("抓取失败时持久化稳定错误并由调用方正常收敛", async () => {
    const prisma = createRunPrisma();
    const storageService = {
      resolveImportContent: vi.fn().mockRejectedValue({ code: "web_fetch_failed" }),
      saveSourceContent: vi.fn(),
      replaceSourceContent: vi.fn(),
    } as any;

    await expect(new IngestionService(prisma, storageService, {} as any).runImportTask("session_1")).resolves.toBeUndefined();

    expect(prisma.agentTask.update).toHaveBeenLastCalledWith({
      where: { id: "task_1" },
      data: {
        status: "failed",
        finishedAt: expect.any(Date),
        lastErrorCode: "web_fetch_failed",
        lastErrorMessage: "无法获取网页内容",
      },
    });
    expect(prisma.ingestionSession.update).toHaveBeenLastCalledWith({
      where: { id: "session_1" },
      data: { status: "failed" },
    });
  });

  it("原路径原子替换失败时不更新来源数据库", async () => {
    const prisma = createRunPrisma();
    const storageService = {
      resolveImportContent: vi.fn().mockResolvedValue({
        title: "解析标题",
        content: "解析正文",
        url: "https://example.com",
      }),
      saveSourceContent: vi.fn().mockResolvedValue({
        localPath: "/tmp/new-source.txt",
        contentHash: "wrong_hash",
      }),
      replaceSourceContent: vi.fn().mockRejectedValue(new Error("atomic_replace_failed")),
    } as any;

    await new IngestionService(prisma, storageService, {} as any).runImportTask("session_1");

    expect(storageService.replaceSourceContent).toHaveBeenCalledTimes(1);
    expect(prisma.source.update).not.toHaveBeenCalled();
    expect(prisma.agentTask.update).toHaveBeenLastCalledWith({
      where: { id: "task_1" },
      data: expect.objectContaining({ status: "failed" }),
    });
  });

  it("同一 pending 任务被重复执行时仅抢占成功者继续处理", async () => {
    const prisma = createRunPrisma();
    prisma.claimPendingIngestionTask.mockResolvedValueOnce({
      id: "task_1",
      status: "running",
      attemptCount: 1,
    }).mockResolvedValueOnce(null);
    const storageService = {
      resolveImportContent: vi.fn().mockResolvedValue({
        title: "唯一标题",
        content: "唯一正文",
        url: "https://example.com",
      }),
      saveSourceContent: vi.fn(),
      replaceSourceContent: vi.fn().mockResolvedValue({
        localPath: "/tmp/original-source.txt",
        contentHash: "unique_hash",
      }),
    } as any;
    const agentClient = {
      generateCandidates: vi.fn().mockResolvedValue({ coreConcepts: [], candidateConcepts: [] }),
    } as any;
    const service = new IngestionService(prisma, storageService, agentClient);

    await Promise.all([service.runImportTask("session_1"), service.runImportTask("session_1")]);

    expect(prisma.claimPendingIngestionTask).toHaveBeenCalledTimes(2);
    expect(storageService.resolveImportContent).toHaveBeenCalledTimes(1);
    expect(storageService.replaceSourceContent).toHaveBeenCalledTimes(1);
    expect(agentClient.generateCandidates).toHaveBeenCalledTimes(1);
  });
});

describe("retryIngestion", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("失败任务增加尝试次数、清理错误与时间并重新排队", async () => {
    let scheduledTask: (() => void) | undefined;
    vi.spyOn(globalThis, "queueMicrotask").mockImplementation((callback) => {
      scheduledTask = callback;
    });
    const prisma = {
      claimFailedIngestionRetry: vi.fn().mockResolvedValue({
        id: "task_1",
        sessionId: "session_1",
        status: "pending",
        attemptCount: 2,
      }),
      ingestionSession: {
        findUnique: vi.fn().mockResolvedValue({
          id: "session_1",
          status: "failed",
          latestAgentTaskId: "task_1",
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      agentTask: {
        findUnique: vi.fn().mockResolvedValue({ id: "task_1", status: "failed", attemptCount: 1 }),
        update: vi.fn().mockResolvedValue({}),
      },
    } as any;

    const result = await new IngestionService(prisma, {} as any, {} as any).retryIngestion("session_1");

    expect(prisma.claimFailedIngestionRetry).toHaveBeenCalledWith("session_1");
    expect(result).toEqual({ sessionId: "session_1", status: "processing" });
    expect(scheduledTask).toBeTypeOf("function");
  });

  it("双击重试时只有原子抢占成功的请求会调度任务", async () => {
    let scheduledCount = 0;
    vi.spyOn(globalThis, "queueMicrotask").mockImplementation(() => {
      scheduledCount += 1;
    });
    const prisma = {
      claimFailedIngestionRetry: vi
        .fn()
        .mockResolvedValueOnce({ id: "task_1", status: "pending", attemptCount: 2 })
        .mockResolvedValueOnce(null),
      ingestionSession: {
        findUnique: vi.fn().mockResolvedValue({
          id: "session_1",
          status: "failed",
          latestAgentTaskId: "task_1",
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      agentTask: {
        findUnique: vi.fn().mockResolvedValue({ id: "task_1", status: "failed", attemptCount: 1 }),
        update: vi.fn().mockResolvedValue({}),
      },
    } as any;
    const service = new IngestionService(prisma, {} as any, {} as any);

    const results = await Promise.allSettled([
      service.retryIngestion("session_1"),
      service.retryIngestion("session_1"),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({
      reason: expect.objectContaining({ message: "仅失败的导入任务可以重试" }),
    });
    expect(prisma.claimFailedIngestionRetry).toHaveBeenCalledTimes(2);
    expect(scheduledCount).toBe(1);
  });

  it("reviewable 会话禁止重试", async () => {
    const prisma = {
      claimFailedIngestionRetry: vi.fn().mockResolvedValue(null),
      ingestionSession: {
        findUnique: vi.fn().mockResolvedValue({
          id: "session_1",
          status: "reviewable",
          latestAgentTaskId: "task_1",
        }),
      },
      agentTask: {
        findUnique: vi.fn().mockResolvedValue({ id: "task_1", status: "succeeded", attemptCount: 1 }),
      },
    } as any;

    await expect(new IngestionService(prisma, {} as any, {} as any).retryIngestion("session_1")).rejects.toThrow(
      new BadRequestException("仅失败的导入任务可以重试"),
    );
  });

  it("重试 URL 会重新解析，并在生成新候选前清除旧候选", async () => {
    const prisma = createRunPrisma();
    const storageService = {
      resolveImportContent: vi.fn().mockResolvedValue({
        title: "重试后的网页标题",
        content: "重试后的网页正文",
        url: "https://example.com",
      }),
      saveSourceContent: vi.fn(),
      replaceSourceContent: vi.fn().mockResolvedValue({
        localPath: "/tmp/original-source.txt",
        contentHash: "retry_hash",
      }),
    } as any;
    const agentClient = {
      generateCandidates: vi.fn().mockResolvedValue({
        coreConcepts: [],
        candidateConcepts: [{ title: "重试新候选", summary: "新摘要" }],
      }),
    } as any;

    await new IngestionService(prisma, storageService, agentClient).runImportTask("session_1");

    expect(storageService.resolveImportContent).toHaveBeenCalledTimes(1);
    expect(storageService.replaceSourceContent).toHaveBeenCalledWith({
      localPath: "/tmp/original-source.txt",
      content: "重试后的网页正文",
    });
    expect(storageService.saveSourceContent).not.toHaveBeenCalled();
    expect(prisma.conceptCandidate.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.conceptCandidate.create.mock.invocationCallOrder[0],
    );
    expect(prisma.conceptCandidate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ sessionId: "session_1", title: "重试新候选" }),
    });
  });
});

describe("IngestionController", () => {
  it("通过 POST /ingestions/:sessionId/retry 暴露手动重试", () => {
    const method = IngestionController.prototype.retryIngestion;

    expect(Reflect.getMetadata(PATH_METADATA, method)).toBe(":sessionId/retry");
    expect(Reflect.getMetadata(METHOD_METADATA, method)).toBe(RequestMethod.POST);
  });
});

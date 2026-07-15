import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { PrismaService } from "./prisma.service";

describe("PrismaService", () => {
  it("两个 SQLite 连接竞争 pending 任务时仅一个能原子抢占为 running", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "learning-os-task-claim-"));
    const config = {
      appRootDir: rootDir,
      databasePath: join(rootDir, "data", "learning-os.db"),
    } as any;
    const first = new PrismaService(config);
    const second = new PrismaService(config);
    await first.onModuleInit();
    await second.onModuleInit();
    const task = await first.agentTask.create({
      data: { type: "ingestion", status: "pending", attemptCount: 1 },
    });

    const claims = await Promise.all([
      first.claimPendingIngestionTask(task.id),
      second.claimPendingIngestionTask(task.id),
    ]);

    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(claims.find(Boolean)).toMatchObject({ id: task.id, status: "running", attemptCount: 1 });
    await expect(first.claimPendingIngestionTask(task.id)).resolves.toBeNull();
    await expect(first.agentTask.findUnique({ where: { id: task.id } })).resolves.toMatchObject({
      status: "running",
      startedAt: expect.any(String),
    });
    await first.onModuleDestroy();
    await second.onModuleDestroy();
  });

  it("两个 SQLite 连接竞争失败重试时仅一个能原子更新会话和任务", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "learning-os-retry-claim-"));
    const config = {
      appRootDir: rootDir,
      databasePath: join(rootDir, "data", "learning-os.db"),
    } as any;
    const first = new PrismaService(config);
    const second = new PrismaService(config);
    await first.onModuleInit();
    await second.onModuleInit();
    const source = await first.source.create({
      data: {
        type: "url",
        title: "失败来源",
        url: "https://example.com",
        localPath: "/tmp/failed-source.txt",
        contentHash: "failed-hash",
        status: "stored",
        content: "",
      },
    });
    const task = await first.agentTask.create({
      data: {
        type: "ingestion",
        status: "failed",
        attemptCount: 1,
        lastErrorCode: "web_fetch_failed",
        lastErrorMessage: "无法获取网页内容",
        startedAt: new Date("2026-07-15T00:00:00.000Z"),
        finishedAt: new Date("2026-07-15T00:01:00.000Z"),
      },
    });
    const session = await first.ingestionSession.create({
      data: {
        sourceId: source.id,
        status: "failed",
        latestAgentTaskId: task.id,
      },
    });
    await first.agentTask.update({ where: { id: task.id }, data: { sessionId: session.id } });

    const claims = await Promise.all([
      first.claimFailedIngestionRetry(session.id),
      second.claimFailedIngestionRetry(session.id),
    ]);

    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(claims.find(Boolean)).toMatchObject({
      id: task.id,
      sessionId: session.id,
      status: "pending",
      attemptCount: 2,
      lastErrorCode: undefined,
      lastErrorMessage: undefined,
      startedAt: undefined,
      finishedAt: undefined,
    });
    await expect(first.claimFailedIngestionRetry(session.id)).resolves.toBeNull();
    await expect(first.ingestionSession.findUnique({ where: { id: session.id } })).resolves.toMatchObject({
      status: "processing",
      latestAgentTaskId: task.id,
    });
    await first.onModuleDestroy();
    await second.onModuleDestroy();
  });

  it("两个 SQLite 连接竞争待审核会话时仅一个能原子抢占为 confirmed", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "learning-os-confirm-claim-"));
    const config = {
      appRootDir: rootDir,
      databasePath: join(rootDir, "data", "learning-os.db"),
    } as any;
    const first = new PrismaService(config);
    const second = new PrismaService(config);
    await first.onModuleInit();
    await second.onModuleInit();
    const source = await first.source.create({
      data: {
        type: "text",
        title: "待审核来源",
        localPath: "/tmp/reviewable-source.txt",
        contentHash: "reviewable-hash",
        status: "stored",
        content: "待审核正文",
      },
    });
    const session = await first.ingestionSession.create({
      data: { sourceId: source.id, status: "reviewable" },
    });

    const claims = await Promise.all([
      first.claimReviewableIngestion(session.id),
      second.claimReviewableIngestion(session.id),
    ]);

    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(claims.find(Boolean)).toMatchObject({
      id: session.id,
      status: "confirmed",
      confirmedAt: expect.any(String),
    });
    await expect(first.claimReviewableIngestion(session.id)).resolves.toBeNull();
    await expect(first.ingestionSession.findUnique({ where: { id: session.id } })).resolves.toMatchObject({
      status: "confirmed",
      confirmedAt: expect.any(String),
      importedAt: undefined,
    });
    await first.onModuleDestroy();
    await second.onModuleDestroy();
  });

  it("按会话清除旧卡片候选", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "learning-os-card-candidate-delete-"));
    const service = new PrismaService({
      appRootDir: rootDir,
      databasePath: join(rootDir, "data", "learning-os.db"),
    } as any);
    await service.onModuleInit();
    const source = await service.source.create({
      data: {
        type: "text",
        title: "候选来源",
        localPath: "/tmp/candidate.txt",
        contentHash: "candidate-hash",
        status: "stored",
        content: "候选正文",
      },
    });
    const session = await service.ingestionSession.create({
      data: { sourceId: source.id, status: "processing" },
    });
    const candidate = await service.conceptCandidate.create({
      data: {
        sessionId: session.id,
        title: "旧候选",
        summary: "旧摘要",
        isCore: true,
        isSelected: true,
      },
    });
    await service.cardCandidate.createMany({
      data: [
        {
          sessionId: session.id,
          conceptCandidateId: candidate.id,
          type: "qa",
          question: "旧问题",
          answer: "旧答案",
          isSelected: true,
        },
      ],
    });

    await expect(service.cardCandidate.deleteMany({ where: { sessionId: session.id } })).resolves.toEqual({
      count: 1,
    });
    await service.onModuleDestroy();
  });

  it("在隔离的 SQLite 数据库中创建并查询失败的智能体任务", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "learning-os-agent-task-"));
    const service = new PrismaService({
      appRootDir: rootDir,
      databasePath: join(rootDir, "data", "learning-os.db"),
    } as any);
    await service.onModuleInit();

    const task = await service.agentTask.create({
      data: {
        status: "failed",
        attemptCount: 1,
        lastErrorCode: "web_fetch_failed",
      },
    });

    const found = await service.agentTask.findUnique({ where: { id: task.id } });

    expect(found).toMatchObject({
      id: task.id,
      status: "failed",
      attemptCount: 1,
      lastErrorCode: "web_fetch_failed",
    });

    await service.onModuleDestroy();
  });

  it("安全升级包含本地路径的旧版笔记表", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "learning-os-legacy-notes-"));
    const databasePath = join(rootDir, "learning-os.db");
    const legacy = new DatabaseSync(databasePath);
    legacy.exec(`
      create table notes (
        id text primary key,
        concept_id text not null,
        title text not null,
        content text not null,
        created_at text not null,
        updated_at text not null
      );
    `);
    legacy.close();

    const service = new PrismaService({ appRootDir: rootDir, databasePath } as any);
    await service.onModuleInit();

    const note = await service.note.create({
      data: {
        conceptId: "concept-1",
        title: "迁移笔记",
        content: "已保留本地路径",
        localPath: "/tmp/note.md",
      },
    });

    expect(note.localPath).toBe("/tmp/note.md");
    await service.onModuleDestroy();
  });

  it("更新来源时省略本地路径会保留现有路径", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "learning-os-source-preserve-path-"));
    const service = new PrismaService({
      appRootDir: rootDir,
      databasePath: join(rootDir, "data", "learning-os.db"),
    } as any);
    await service.onModuleInit();
    const created = await service.source.create({
      data: {
        type: "text",
        title: "原始来源",
        localPath: "/tmp/original-source.txt",
        contentHash: "hash",
        status: "stored",
        content: "内容",
      },
    });

    const source = await service.source.update({
      where: { id: created.id },
      data: { title: "更新后的来源" },
    });

    expect(source.localPath).toBe("/tmp/original-source.txt");
    await service.onModuleDestroy();
  });

  it("更新来源时传入 null 会以稳定错误拒绝清空本地路径", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "learning-os-source-null-path-"));
    const service = new PrismaService({
      appRootDir: rootDir,
      databasePath: join(rootDir, "data", "learning-os.db"),
    } as any);
    await service.onModuleInit();
    const created = await service.source.create({
      data: {
        type: "text",
        title: "来源",
        localPath: "/tmp/source.txt",
        contentHash: "hash",
        status: "stored",
        content: "内容",
      },
    });

    await expect(
      service.source.update({ where: { id: created.id }, data: { localPath: null } }),
    ).rejects.toThrow("source_local_path_required");
    await service.onModuleDestroy();
  });

  it("更新来源时传入空字符串会以稳定错误拒绝清空本地路径", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "learning-os-source-empty-path-"));
    const service = new PrismaService({
      appRootDir: rootDir,
      databasePath: join(rootDir, "data", "learning-os.db"),
    } as any);
    await service.onModuleInit();
    const created = await service.source.create({
      data: {
        type: "text",
        title: "来源",
        localPath: "/tmp/source.txt",
        contentHash: "hash",
        status: "stored",
        content: "内容",
      },
    });

    await expect(
      service.source.update({ where: { id: created.id }, data: { localPath: "" } }),
    ).rejects.toThrow("source_local_path_required");
    await service.onModuleDestroy();
  });

  it("映射来源时保留空字符串本地路径", () => {
    const service = new PrismaService({} as any);

    const source = (service as any).mapSource({
      id: "source-empty-path",
      type: "text",
      title: "空路径来源",
      url: null,
      local_path: "",
      content_hash: "hash",
      status: "stored",
      content: "内容",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    expect(source.localPath).toBe("");
  });

  it("事务工作失败时回滚并重新抛出错误", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "learning-os-transaction-"));
    const service = new PrismaService({
      appRootDir: rootDir,
      databasePath: join(rootDir, "data", "learning-os.db"),
    } as any);
    await service.onModuleInit();
    let sessionId = "";

    await expect(
      service.transaction(async (prisma) => {
        const source = await prisma.source.create({
          data: {
            type: "text",
            title: "事务来源",
            localPath: "/tmp/transaction.txt",
            contentHash: "transaction-hash",
            status: "stored",
            content: "事务内容",
          },
        });
        const session = await prisma.ingestionSession.create({
          data: { sourceId: source.id, status: "created" },
        });
        sessionId = session.id;
        throw new Error("transaction_failed");
      }),
    ).rejects.toThrow("transaction_failed");

    await expect(service.ingestionSession.findUnique({ where: { id: sessionId } })).resolves.toBeNull();
    await service.onModuleDestroy();
  });

  it("事务回滚不会吞掉原服务在并发期间成功写入的数据", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "learning-os-transaction-isolation-"));
    const service = new PrismaService({
      appRootDir: rootDir,
      databasePath: join(rootDir, "data", "learning-os.db"),
    } as any);
    await service.onModuleInit();

    let allowRollback!: () => void;
    const rollbackGate = new Promise<void>((resolve) => {
      allowRollback = resolve;
    });
    let transactionStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      transactionStarted = resolve;
    });
    const transaction = service.transaction(async (prisma) => {
      await prisma.source.create({
        data: {
          type: "text",
          title: "事务内来源",
          localPath: "/tmp/transaction-inner.txt",
          contentHash: "transaction-inner-hash",
          status: "stored",
          content: "事务内内容",
        },
      });
      transactionStarted();
      await rollbackGate;
      throw new Error("transaction_failed");
    });
    await started;

    let externalSessionId: string | undefined;
    let externalWriteError: unknown;
    try {
      const source = await service.source.create({
        data: {
          type: "text",
          title: "事务外来源",
          localPath: "/tmp/transaction-outer.txt",
          contentHash: "transaction-outer-hash",
          status: "stored",
          content: "事务外内容",
        },
      });
      const session = await service.ingestionSession.create({
        data: { sourceId: source.id, status: "created" },
      });
      externalSessionId = session.id;
    } catch (error) {
      externalWriteError = error;
    }

    allowRollback();
    await expect(transaction).rejects.toThrow("transaction_failed");

    if (externalSessionId) {
      await expect(service.ingestionSession.findUnique({ where: { id: externalSessionId } })).resolves.toMatchObject({
        id: externalSessionId,
      });
    } else {
      expect(externalWriteError).toBeDefined();
    }
    await service.onModuleDestroy();
  });

  it("persists records in a real sqlite database file across service instances", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "learning-os-sqlite-"));
    const databasePath = join(rootDir, "data", "learning-os.db");
    const config = {
      appRootDir: rootDir,
      databasePath,
    } as any;

    const first = new PrismaService(config);
    await first.onModuleInit();

    expect(existsSync(databasePath)).toBe(true);

    const source = await first.source.create({
      data: {
        type: "text",
        title: "RSC",
        localPath: "/tmp/rsc.txt",
        contentHash: "hash",
        status: "stored",
        content: "React Server Components",
      },
    });

    const session = await first.ingestionSession.create({
      data: {
        sourceId: source.id,
        status: "reviewable",
      },
    });

    const second = new PrismaService(config);
    await second.onModuleInit();

    const loaded = await second.ingestionSession.findUnique({
      where: { id: session.id },
      include: { source: true },
    });

    expect(loaded?.source?.title).toBe("RSC");
  });
});

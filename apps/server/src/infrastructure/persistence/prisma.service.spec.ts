import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { PrismaService } from "./prisma.service";

describe("PrismaService", () => {
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

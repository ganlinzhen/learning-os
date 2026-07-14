import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { PrismaService } from "./prisma.service";

describe("PrismaService", () => {
  it("creates and finds a failed agent task in an isolated sqlite database", async () => {
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

  it("safely upgrades legacy notes table with local path", async () => {
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

  it("rolls back and rethrows when transaction work fails", async () => {
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

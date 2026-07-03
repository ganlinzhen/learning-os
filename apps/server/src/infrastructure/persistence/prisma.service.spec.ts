import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PrismaService } from "./prisma.service";

describe("PrismaService", () => {
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

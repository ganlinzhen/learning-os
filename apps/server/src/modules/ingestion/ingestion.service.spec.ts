import { describe, expect, it, vi } from "vitest";
import { IngestionService } from "./ingestion.service";

describe("IngestionService", () => {
  it("creates source and ingestion session for text import", async () => {
    const prisma = {
      source: { create: vi.fn().mockResolvedValue({ id: "src_1" }) },
      ingestionSession: {
        create: vi.fn().mockResolvedValue({ id: "session_1", status: "created" }),
        update: vi.fn().mockResolvedValue({ id: "session_1", status: "reviewable" }),
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
  });
});

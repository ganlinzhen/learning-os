import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { IngestionService } from "./ingestion.service";

const candidate = {
  id: "cand_1",
  sessionId: "session_1",
  title: "RSC",
  summary: "服务端组件",
  evidence: "服务端渲染",
  isSelected: true,
  cards: [
    {
      id: "card_1",
      type: "qa",
      question: "RSC 是什么？",
      answer: "服务端组件",
      explanation: "在服务端渲染",
      isSelected: true,
    },
    {
      id: "card_2",
      type: "qa",
      question: "未选问题",
      answer: "未选答案",
      explanation: "",
      isSelected: false,
    },
  ],
};

function createContext(options?: { status?: string; candidates?: typeof candidate[] }) {
  const tx = {
    concept: { create: vi.fn().mockImplementation(async ({ data }: any) => data) },
    reviewCard: { create: vi.fn().mockImplementation(async ({ data }: any) => data) },
    note: { create: vi.fn().mockImplementation(async ({ data }: any) => data) },
    ingestionSession: { update: vi.fn().mockImplementation(async ({ data }: any) => data) },
  };
  const prisma = {
    ingestionSession: {
      findUnique: vi.fn().mockResolvedValue({
        id: "session_1",
        sourceId: "source_1",
        status: options?.status ?? "reviewable",
        source: { id: "source_1" },
      }),
    },
    conceptCandidate: {
      findMany: vi.fn().mockResolvedValue(options?.candidates ?? [candidate]),
    },
    transaction: vi.fn().mockImplementation(async (work: (client: typeof tx) => Promise<unknown>) => work(tx)),
  };
  const storage = {
    writeNotes: vi.fn().mockResolvedValue([
      {
        title: "RSC",
        content: "# RSC\n\n结构化笔记",
        localPath: "/tmp/notes/RSC-concept_1.md",
      },
    ]),
    removeFiles: vi.fn().mockResolvedValue(undefined),
  };
  const service = new IngestionService(prisma as any, storage as any, {} as any);
  return { service, prisma, storage, tx };
}

describe("confirmIngestion", () => {
  it("成功时先写入选中卡片的 Markdown，再通过事务双写数据库并更新会话", async () => {
    const { service, prisma, storage, tx } = createContext();

    const result = await service.confirmIngestion("session_1", {
      selectedCandidateIds: ["cand_1"],
    });

    expect(result).toEqual({ importedConceptCount: 1 });
    expect(prisma.ingestionSession.findUnique).toHaveBeenCalledWith({
      where: { id: "session_1" },
      include: { source: true },
    });
    expect(storage.writeNotes).toHaveBeenCalledTimes(1);
    const [noteInputs] = storage.writeNotes.mock.calls[0];
    expect(noteInputs).toHaveLength(1);
    expect(noteInputs[0]).toMatchObject({
      sourceId: "source_1",
      title: "RSC",
      summary: "服务端组件",
      evidence: "服务端渲染",
      cards: [expect.objectContaining({ id: "card_1", question: "RSC 是什么？" })],
    });
    expect(noteInputs[0].conceptId).toEqual(expect.any(String));
    expect(noteInputs[0].cards).toHaveLength(1);
    expect(prisma.transaction).toHaveBeenCalledTimes(1);
    expect(tx.concept.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: noteInputs[0].conceptId,
        title: "RSC",
        summary: "服务端组件",
      }),
    });
    expect(tx.reviewCard.create).toHaveBeenCalledTimes(1);
    expect(tx.reviewCard.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        conceptId: noteInputs[0].conceptId,
        question: "RSC 是什么？",
      }),
    });
    expect(tx.note.create).toHaveBeenCalledWith({
      data: {
        conceptId: noteInputs[0].conceptId,
        title: "RSC",
        content: "# RSC\n\n结构化笔记",
        localPath: "/tmp/notes/RSC-concept_1.md",
      },
    });
    expect(tx.ingestionSession.update).toHaveBeenCalledWith({
      where: { id: "session_1" },
      data: { status: "imported", confirmedAt: expect.any(Date), importedAt: expect.any(Date) },
    });
    expect(storage.removeFiles).not.toHaveBeenCalled();
  });

  it("显式传入空卡片列表时不回退候选默认选择", async () => {
    const { service, storage, tx } = createContext();

    await service.confirmIngestion("session_1", {
      selectedCandidateIds: ["cand_1"],
      selectedCardIds: [],
    });

    const [noteInputs] = storage.writeNotes.mock.calls[0];
    expect(noteInputs[0].cards).toEqual([]);
    expect(tx.reviewCard.create).not.toHaveBeenCalled();
  });

  it("文件写入失败时不启动数据库事务", async () => {
    const { service, prisma, storage } = createContext();
    storage.writeNotes.mockRejectedValueOnce(new Error("disk_full"));

    await expect(
      service.confirmIngestion("session_1", { selectedCandidateIds: ["cand_1"] }),
    ).rejects.toThrow("disk_full");

    expect(prisma.transaction).not.toHaveBeenCalled();
    expect(storage.removeFiles).not.toHaveBeenCalled();
  });

  it("数据库事务失败时删除本次写入的笔记并重新抛出", async () => {
    const { service, prisma, storage } = createContext();
    prisma.transaction.mockRejectedValueOnce(new Error("sqlite_failed"));

    await expect(
      service.confirmIngestion("session_1", { selectedCandidateIds: ["cand_1"] }),
    ).rejects.toThrow("sqlite_failed");

    expect(storage.removeFiles).toHaveBeenCalledWith(["/tmp/notes/RSC-concept_1.md"]);
  });

  it.each(["processing", "imported"])("拒绝 %s 状态的确认", async (status) => {
    const { service, prisma, storage } = createContext({ status });

    await expect(
      service.confirmIngestion("session_1", { selectedCandidateIds: ["cand_1"] }),
    ).rejects.toEqual(new BadRequestException("仅可确认待审核的导入"));

    expect(prisma.conceptCandidate.findMany).not.toHaveBeenCalled();
    expect(storage.writeNotes).not.toHaveBeenCalled();
    expect(prisma.transaction).not.toHaveBeenCalled();
  });

  it("拒绝不属于当前会话的候选", async () => {
    const { service, prisma, storage } = createContext({ candidates: [] });

    await expect(
      service.confirmIngestion("session_1", { selectedCandidateIds: ["foreign_candidate"] }),
    ).rejects.toThrow("所选候选不属于当前导入");

    expect(prisma.conceptCandidate.findMany).toHaveBeenCalledWith({
      where: { sessionId: "session_1", id: { in: ["foreign_candidate"] } },
      include: { cards: true },
    });
    expect(storage.writeNotes).not.toHaveBeenCalled();
    expect(prisma.transaction).not.toHaveBeenCalled();
  });
});

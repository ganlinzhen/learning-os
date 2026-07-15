import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type { ConfirmIngestionDto, CreateImportDto, IngestionDetailDto } from "@learning-os/contracts";
import { randomUUID } from "node:crypto";
import { AgentClientService } from "../../infrastructure/agent/agent-client.service";
import { PrismaService } from "../../infrastructure/persistence/prisma.service";
import { StorageService } from "../../infrastructure/storage/storage.service";

type ImportSource = {
  id: string;
  type: "text" | "url" | "markdown";
  title: string;
  content: string;
  url?: string;
  localPath: string;
};

@Injectable()
export class IngestionService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService | any,
    @Inject(StorageService) private readonly storageService: StorageService | any,
    @Inject(AgentClientService) private readonly agentClient: AgentClientService | any,
  ) {}

  async createImport(input: CreateImportDto) {
    this.validateImport(input);
    const initialTitle = input.title?.trim() ?? "";
    const initialContent = input.content ?? "";
    const stored = await this.storageService.saveSourceContent({
      type: input.type,
      title: initialTitle,
      content: initialContent,
    });
    const source = await this.prisma.source.create({
      data: {
        type: input.type,
        title: initialTitle,
        url: input.url,
        content: initialContent,
        localPath: stored.localPath,
        contentHash: stored.contentHash,
        status: "stored",
      },
    });
    const task = await this.prisma.agentTask.create({
      data: { type: "ingestion", status: "pending", attemptCount: 1 },
    });
    const session = await this.prisma.ingestionSession.create({
      data: {
        sourceId: source.id,
        status: "processing",
        latestAgentTaskId: task.id,
      },
    });
    await this.prisma.agentTask.update({
      where: { id: task.id },
      data: { sessionId: session.id },
    });

    this.scheduleImportTask(session.id);
    return { sourceId: source.id, sessionId: session.id, status: "processing" as const };
  }

  async runImportTask(sessionId: string): Promise<void> {
    const session = await this.prisma.ingestionSession.findUnique({
      where: { id: sessionId },
      include: { source: true },
    });
    const taskId = session?.latestAgentTaskId;
    if (!session?.source || !taskId) {
      return;
    }
    const claimedTask = await this.prisma.claimPendingIngestionTask(taskId);
    if (!claimedTask) {
      return;
    }

    try {
      const source = session.source as ImportSource;
      const resolved = await this.storageService.resolveImportContent({
        type: source.type,
        title: source.title,
        content: source.content,
        url: source.url,
      });
      const stored = await this.storageService.replaceSourceContent({
        localPath: source.localPath,
        content: resolved.content,
      });
      await this.prisma.source.update({
        where: { id: source.id },
        data: {
          type: source.type,
          title: resolved.title,
          content: resolved.content,
          url: resolved.url,
          localPath: source.localPath,
          contentHash: stored.contentHash,
          status: "stored",
        },
      });
      const candidateResult = await this.agentClient.generateCandidates({
        title: resolved.title,
        content: resolved.content,
      });

      await this.prisma.cardCandidate.deleteMany({ where: { sessionId } });
      await this.prisma.conceptCandidate.deleteMany({ where: { sessionId } });
      await this.saveCandidates(sessionId, candidateResult);
      await this.prisma.agentTask.update({
        where: { id: taskId },
        data: {
          status: "succeeded",
          finishedAt: new Date(),
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      });
      await this.prisma.ingestionSession.update({
        where: { id: sessionId },
        data: { status: "reviewable" },
      });
    } catch (error) {
      const normalized = this.normalizeImportError(error);
      await this.prisma.agentTask
        .update({
          where: { id: taskId },
          data: {
            status: "failed",
            finishedAt: new Date(),
            lastErrorCode: normalized.code,
            lastErrorMessage: normalized.message,
          },
        })
        .catch(() => undefined);
      await this.prisma.ingestionSession
        .update({ where: { id: sessionId }, data: { status: "failed" } })
        .catch(() => undefined);
    }
  }

  async retryIngestion(sessionId: string) {
    const task = await this.prisma.claimFailedIngestionRetry(sessionId);
    if (!task) {
      throw new BadRequestException("仅失败的导入任务可以重试");
    }
    this.scheduleImportTask(sessionId);
    return { sessionId, status: "processing" as const };
  }

  async getIngestionDetail(sessionId: string): Promise<IngestionDetailDto> {
    const session = await this.prisma.ingestionSession.findUnique({
      where: { id: sessionId },
      include: {
        source: true,
        candidates: { include: { cards: true } },
      },
    });
    const coreConcepts = session.candidates.filter((item: any) => item.isCore).map(this.mapCandidate);
    const candidateConcepts = session.candidates.filter((item: any) => !item.isCore).map(this.mapCandidate);
    const latestTask = session.latestAgentTaskId
      ? await this.prisma.agentTask.findUnique({ where: { id: session.latestAgentTaskId } })
      : null;
    const task = latestTask
      ? {
          id: latestTask.id,
          status: latestTask.status,
          attemptCount: latestTask.attemptCount,
          lastErrorCode: latestTask.lastErrorCode,
          lastErrorMessage: latestTask.lastErrorMessage,
          canRetry: session.status === "failed" && latestTask.status === "failed",
        }
      : {
          id: `legacy:${session.id}`,
          status: this.getLegacyTaskStatus(session.status),
          attemptCount: 0,
          canRetry: false,
        };

    return {
      sessionId: session.id,
      sourceId: session.sourceId,
      title: session.source.title,
      sourceType: session.source.type,
      status: session.status,
      coreConcepts,
      candidateConcepts,
      task,
    };
  }

  async confirmIngestion(sessionId: string, input: ConfirmIngestionDto) {
    const session = await this.prisma.ingestionSession.findUnique({
      where: { id: sessionId },
      include: { source: true },
    });
    if (session?.status !== "reviewable" || !session.source) {
      throw new BadRequestException("仅可确认待审核的导入");
    }
    const candidates = await this.prisma.conceptCandidate.findMany({
      where: { sessionId, id: { in: input.selectedCandidateIds } },
      include: { cards: true },
    });
    if (candidates.length !== new Set(input.selectedCandidateIds).size) {
      throw new BadRequestException("所选候选不属于当前导入");
    }

    const imports: Array<{ conceptId: string; candidate: any; cards: any[] }> = candidates.map((candidate: any) => ({
      conceptId: randomUUID(),
      candidate,
      cards: candidate.cards.filter((card: any) =>
        input.selectedCardIds !== undefined ? input.selectedCardIds.includes(card.id) : card.isSelected,
      ),
    }));
    const notes = await this.storageService.writeNotes(
      imports.map(({ conceptId, candidate, cards }) => ({
        conceptId,
        sourceId: session.source.id,
        title: candidate.title,
        summary: candidate.summary,
        evidence: candidate.evidence ?? "",
        cards,
      })),
    );

    try {
      await this.prisma.transaction(async (tx: any) => {
        const claimedSession = await tx.claimReviewableIngestion(sessionId);
        if (!claimedSession) {
          throw new BadRequestException("仅可确认待审核的导入");
        }
        for (const [index, item] of imports.entries()) {
          await tx.concept.create({
            data: {
              id: item.conceptId,
              title: item.candidate.title,
              summary: item.candidate.summary,
              explanation: item.candidate.summary,
              evidence: item.candidate.evidence,
              status: "new",
              masteryScore: 0,
            },
          });
          for (const card of item.cards) {
            await tx.reviewCard.create({
              data: {
                conceptId: item.conceptId,
                type: card.type,
                question: card.question,
                answer: card.answer,
                explanation: card.explanation,
                dueAt: new Date(),
              },
            });
          }
          const note = notes[index];
          await tx.note.create({
            data: {
              conceptId: item.conceptId,
              title: note.title,
              content: note.content,
              localPath: note.localPath,
            },
          });
        }
        await tx.ingestionSession.update({
          where: { id: sessionId },
          data: {
            status: "imported",
            importedAt: new Date(),
          },
        });
      });
    } catch (error) {
      await this.storageService.removeFiles(notes.map((note: any) => note.localPath));
      throw error;
    }
    return { importedConceptCount: candidates.length };
  }

  private scheduleImportTask(sessionId: string) {
    queueMicrotask(() => {
      void this.runImportTask(sessionId).catch(() => undefined);
    });
  }

  private validateImport(input: CreateImportDto) {
    if (input.type === "url") {
      if (typeof input.url !== "string" || input.url.trim().length === 0) {
        throw new BadRequestException("网页导入必须提供有效地址");
      }
      return;
    }
    if (typeof input.content !== "string" || input.content.trim().length === 0) {
      throw new BadRequestException(input.type === "markdown" ? "Markdown 导入必须提供非空正文" : "文本导入必须提供非空标题和正文");
    }
    if (input.type === "text" && (typeof input.title !== "string" || input.title.trim().length === 0)) {
      throw new BadRequestException("文本导入必须提供非空标题和正文");
    }
  }

  private async saveCandidates(sessionId: string, candidateResult: any) {
    const allConcepts = [
      ...(candidateResult.coreConcepts ?? []).map((concept: any) => ({ ...concept, isCore: true, isSelected: true })),
      ...(candidateResult.candidateConcepts ?? []).map((concept: any) => ({
        ...concept,
        isCore: false,
        isSelected: concept.isSelected ?? false,
      })),
    ];
    for (const concept of allConcepts) {
      const createdCandidate = await this.prisma.conceptCandidate.create({
        data: {
          sessionId,
          title: concept.title,
          summary: concept.summary,
          evidence: concept.evidence ?? "",
          isCore: concept.isCore,
          isSelected: concept.isSelected,
        },
      });
      if (concept.cards?.length) {
        await this.prisma.cardCandidate.createMany({
          data: concept.cards.map((card: any) => ({
            sessionId,
            conceptCandidateId: createdCandidate.id,
            type: card.type,
            question: card.question,
            answer: card.answer,
            explanation: card.explanation ?? "",
            isSelected: card.isSelected ?? true,
          })),
        });
      }
    }
  }

  private normalizeImportError(error: unknown) {
    const rawCode =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : error instanceof Error
          ? error.message
          : "";
    const messages: Record<string, string> = {
      web_url_invalid: "网页地址无效",
      web_fetch_failed: "无法获取网页内容",
      web_content_unsupported: "暂不支持该网页内容类型",
      web_content_empty: "网页正文为空",
      agent_request_failed: "内容生成失败，请手动重试",
    };
    return messages[rawCode]
      ? { code: rawCode, message: messages[rawCode] }
      : { code: "import_failed", message: "导入处理失败，请手动重试" };
  }

  private mapCandidate = (item: any) => ({
    id: item.id,
    title: item.title,
    summary: item.summary,
    evidence: item.evidence ?? "",
    isCore: item.isCore,
    isSelected: item.isSelected,
    cards: item.cards.map((card: any) => ({
      id: card.id,
      conceptCandidateId: item.id,
      type: card.type,
      question: card.question,
      answer: card.answer,
      explanation: card.explanation ?? "",
      isSelected: card.isSelected,
    })),
  });

  private getLegacyTaskStatus(sessionStatus: string) {
    if (sessionStatus === "created") return "pending" as const;
    if (sessionStatus === "processing") return "running" as const;
    return sessionStatus === "failed" ? ("failed" as const) : ("succeeded" as const);
  }
}

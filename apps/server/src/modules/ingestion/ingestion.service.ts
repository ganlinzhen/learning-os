import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type { ConfirmIngestionDto, CreateImportDto, IngestionDetailDto } from "@learning-os/contracts";
import { AgentClientService } from "../../infrastructure/agent/agent-client.service";
import { PrismaService } from "../../infrastructure/persistence/prisma.service";
import { StorageService } from "../../infrastructure/storage/storage.service";

@Injectable()
export class IngestionService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService | any,
    @Inject(StorageService) private readonly storageService: StorageService | any,
    @Inject(AgentClientService) private readonly agentClient: AgentClientService | any,
  ) {}

  async createImport(input: CreateImportDto) {
    if (input.type !== "text") {
      throw new BadRequestException(`当前入口暂不支持 ${input.type} 导入`);
    }
    if (
      typeof input.title !== "string" ||
      input.title.trim().length === 0 ||
      typeof input.content !== "string" ||
      input.content.trim().length === 0
    ) {
      throw new BadRequestException("文本导入必须提供非空标题和正文");
    }

    const stored = await this.storageService.saveSourceContent(input);
    const source = await this.prisma.source.create({
      data: {
        type: input.type,
        title: input.title,
        url: input.url,
        content: input.content,
        localPath: stored.localPath,
        contentHash: stored.contentHash,
        status: "stored",
      },
    });

    const task = this.prisma.agentTask?.create
      ? await this.prisma.agentTask.create({
          data: { status: "running" },
        })
      : { id: "task_local" };

    const session = await this.prisma.ingestionSession.create({
      data: {
        sourceId: source.id,
        status: "processing",
        latestAgentTaskId: task.id,
      },
    });

    if (this.prisma.agentTask?.update) {
      await this.prisma.agentTask.update({
        where: { id: task.id },
        data: { sessionId: session.id },
      });
    }

    const candidateResult = await this.agentClient.generateCandidates({
      title: input.title,
      content: input.content,
    });

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
          sessionId: session.id,
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
            sessionId: session.id,
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

    await this.prisma.ingestionSession.update({
      where: { id: session.id },
      data: { status: "reviewable" },
    });

    if (this.prisma.agentTask?.update) {
      await this.prisma.agentTask.update({
        where: { id: task.id },
        data: { status: "succeeded" },
      });
    }

    return { sourceId: source.id, sessionId: session.id, status: "reviewable" };
  }

  async getIngestionDetail(sessionId: string): Promise<IngestionDetailDto> {
    const session = await this.prisma.ingestionSession.findUnique({
      where: { id: sessionId },
      include: {
        source: true,
        candidates: {
          include: {
            cards: true,
          },
        },
      },
    });

    const coreConcepts = session.candidates.filter((item: any) => item.isCore).map(this.mapCandidate);
    const candidateConcepts = session.candidates
      .filter((item: any) => !item.isCore)
      .map(this.mapCandidate);
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
    const candidates = await this.prisma.conceptCandidate.findMany({
      where: { sessionId, id: { in: input.selectedCandidateIds } },
      include: { cards: true },
    });

    for (const candidate of candidates) {
      const concept = await this.prisma.concept.create({
        data: {
          title: candidate.title,
          summary: candidate.summary,
          explanation: candidate.summary,
          evidence: candidate.evidence,
          status: "new",
          masteryScore: 0,
        },
      });

      const selectedCards = candidate.cards.filter((card: any) =>
        input.selectedCardIds?.length ? input.selectedCardIds.includes(card.id) : card.isSelected,
      );

      for (const card of selectedCards) {
        await this.prisma.reviewCard.create({
          data: {
            conceptId: concept.id,
            type: card.type,
            question: card.question,
            answer: card.answer,
            explanation: card.explanation,
            dueAt: new Date(),
          },
        });
      }
    }

    await this.prisma.ingestionSession.update({
      where: { id: sessionId },
      data: {
        status: "imported",
        confirmedAt: new Date(),
        importedAt: new Date(),
      },
    });

    return { importedConceptCount: candidates.length };
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
    if (sessionStatus === "created") {
      return "pending" as const;
    }
    if (sessionStatus === "processing") {
      return "running" as const;
    }
    return sessionStatus === "failed" ? ("failed" as const) : ("succeeded" as const);
  }
}

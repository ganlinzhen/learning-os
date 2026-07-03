"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IngestionService = void 0;
const common_1 = require("@nestjs/common");
const agent_client_service_1 = require("../../infrastructure/agent/agent-client.service");
const prisma_service_1 = require("../../infrastructure/persistence/prisma.service");
const storage_service_1 = require("../../infrastructure/storage/storage.service");
let IngestionService = class IngestionService {
    prisma;
    storageService;
    agentClient;
    constructor(prisma, storageService, agentClient) {
        this.prisma = prisma;
        this.storageService = storageService;
        this.agentClient = agentClient;
    }
    async createImport(input) {
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
        const candidateResult = await this.agentClient.generateCandidates({
            title: input.title,
            content: input.content,
        });
        const allConcepts = [
            ...(candidateResult.coreConcepts ?? []).map((concept) => ({ ...concept, isCore: true, isSelected: true })),
            ...(candidateResult.candidateConcepts ?? []).map((concept) => ({
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
                    data: concept.cards.map((card) => ({
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
    async getIngestionDetail(sessionId) {
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
        const coreConcepts = session.candidates.filter((item) => item.isCore).map(this.mapCandidate);
        const candidateConcepts = session.candidates
            .filter((item) => !item.isCore)
            .map(this.mapCandidate);
        return {
            sessionId: session.id,
            sourceId: session.sourceId,
            title: session.source.title,
            sourceType: session.source.type,
            status: session.status,
            coreConcepts,
            candidateConcepts,
        };
    }
    async confirmIngestion(sessionId, input) {
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
            const selectedCards = candidate.cards.filter((card) => input.selectedCardIds?.length ? input.selectedCardIds.includes(card.id) : card.isSelected);
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
    mapCandidate = (item) => ({
        id: item.id,
        title: item.title,
        summary: item.summary,
        evidence: item.evidence ?? "",
        isCore: item.isCore,
        isSelected: item.isSelected,
        cards: item.cards.map((card) => ({
            id: card.id,
            conceptCandidateId: item.id,
            type: card.type,
            question: card.question,
            answer: card.answer,
            explanation: card.explanation ?? "",
            isSelected: card.isSelected,
        })),
    });
};
exports.IngestionService = IngestionService;
exports.IngestionService = IngestionService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(prisma_service_1.PrismaService)),
    __param(1, (0, common_1.Inject)(storage_service_1.StorageService)),
    __param(2, (0, common_1.Inject)(agent_client_service_1.AgentClientService)),
    __metadata("design:paramtypes", [Object, Object, Object])
], IngestionService);

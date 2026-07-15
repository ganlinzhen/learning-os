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
const node_crypto_1 = require("node:crypto");
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
        return { sourceId: source.id, sessionId: session.id, status: "processing" };
    }
    async runImportTask(sessionId) {
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
            const source = session.source;
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
        }
        catch (error) {
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
    async retryIngestion(sessionId) {
        const task = await this.prisma.claimFailedIngestionRetry(sessionId);
        if (!task) {
            throw new common_1.BadRequestException("仅失败的导入任务可以重试");
        }
        this.scheduleImportTask(sessionId);
        return { sessionId, status: "processing" };
    }
    async getIngestionDetail(sessionId) {
        const session = await this.prisma.ingestionSession.findUnique({
            where: { id: sessionId },
            include: {
                source: true,
                candidates: { include: { cards: true } },
            },
        });
        const coreConcepts = session.candidates.filter((item) => item.isCore).map(this.mapCandidate);
        const candidateConcepts = session.candidates.filter((item) => !item.isCore).map(this.mapCandidate);
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
    async confirmIngestion(sessionId, input) {
        this.validateConfirmation(input);
        const session = await this.prisma.ingestionSession.findUnique({
            where: { id: sessionId },
            include: { source: true },
        });
        if (session?.status !== "reviewable" || !session.source) {
            throw new common_1.BadRequestException("仅可确认待审核的导入");
        }
        const candidates = await this.prisma.conceptCandidate.findMany({
            where: { sessionId, id: { in: input.selectedCandidateIds } },
            include: { cards: true },
        });
        if (candidates.length !== input.selectedCandidateIds.length) {
            throw new common_1.BadRequestException("所选候选不属于当前导入");
        }
        const availableCardIds = new Set(candidates.flatMap((candidate) => candidate.cards.map((card) => card.id)));
        if (input.selectedCardIds.some((cardId) => !availableCardIds.has(cardId))) {
            throw new common_1.BadRequestException("所选卡片不属于当前导入");
        }
        const imports = candidates.map((candidate) => ({
            conceptId: (0, node_crypto_1.randomUUID)(),
            candidate,
            cards: candidate.cards.filter((card) => input.selectedCardIds.includes(card.id)),
        }));
        const notes = await this.storageService.writeNotes(imports.map(({ conceptId, candidate, cards }) => ({
            conceptId,
            sourceId: session.source.id,
            title: candidate.title,
            summary: candidate.summary,
            evidence: candidate.evidence ?? "",
            cards,
        })));
        try {
            await this.prisma.transaction(async (tx) => {
                const claimedSession = await tx.claimReviewableIngestion(sessionId);
                if (!claimedSession) {
                    throw new common_1.BadRequestException("仅可确认待审核的导入");
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
        }
        catch (error) {
            await this.storageService.removeFiles(notes.map((note) => note.localPath));
            throw error;
        }
        return { importedConceptCount: candidates.length };
    }
    scheduleImportTask(sessionId) {
        queueMicrotask(() => {
            void this.runImportTask(sessionId).catch(() => undefined);
        });
    }
    validateImport(input) {
        if (typeof input !== "object" || input === null || Array.isArray(input)) {
            throw new common_1.BadRequestException("导入参数无效");
        }
        if (input.type !== "text" && input.type !== "url" && input.type !== "markdown") {
            throw new common_1.BadRequestException("导入类型无效");
        }
        if ((input.title !== undefined && typeof input.title !== "string") ||
            (input.content !== undefined && typeof input.content !== "string") ||
            (input.url !== undefined && typeof input.url !== "string")) {
            throw new common_1.BadRequestException("导入参数必须为字符串");
        }
        if (input.title !== undefined && input.title.trim().length === 0) {
            throw new common_1.BadRequestException("导入标题不能为空");
        }
        if (input.type === "url") {
            if (!input.url?.trim() || input.content !== undefined) {
                throw new common_1.BadRequestException("网页导入只能提供有效地址和可选标题");
            }
            return;
        }
        if (!input.content?.trim() || input.url !== undefined) {
            throw new common_1.BadRequestException(input.type === "markdown" ? "Markdown 导入只能提供正文和可选标题" : "文本导入必须提供非空标题和正文");
        }
        if (input.type === "text" && !input.title?.trim()) {
            throw new common_1.BadRequestException("文本导入必须提供非空标题和正文");
        }
    }
    validateConfirmation(input) {
        if (typeof input !== "object" ||
            input === null ||
            Array.isArray(input) ||
            !Array.isArray(input.selectedCandidateIds) ||
            !Array.isArray(input.selectedCardIds) ||
            !input.selectedCandidateIds.every((id) => typeof id === "string" && id.trim().length > 0) ||
            !input.selectedCardIds.every((id) => typeof id === "string" && id.trim().length > 0)) {
            throw new common_1.BadRequestException("确认参数必须包含候选和卡片字符串数组");
        }
        if (new Set(input.selectedCandidateIds).size !== input.selectedCandidateIds.length ||
            new Set(input.selectedCardIds).size !== input.selectedCardIds.length) {
            throw new common_1.BadRequestException("确认参数不允许重复 ID");
        }
    }
    async saveCandidates(sessionId, candidateResult) {
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
                    data: concept.cards.map((card) => ({
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
    normalizeImportError(error) {
        const rawCode = typeof error === "object" && error !== null && "code" in error
            ? String(error.code)
            : error instanceof Error
                ? error.message
                : "";
        const messages = {
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
    getLegacyTaskStatus(sessionStatus) {
        if (sessionStatus === "created")
            return "pending";
        if (sessionStatus === "processing")
            return "running";
        return sessionStatus === "failed" ? "failed" : "succeeded";
    }
};
exports.IngestionService = IngestionService;
exports.IngestionService = IngestionService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(prisma_service_1.PrismaService)),
    __param(1, (0, common_1.Inject)(storage_service_1.StorageService)),
    __param(2, (0, common_1.Inject)(agent_client_service_1.AgentClientService)),
    __metadata("design:paramtypes", [Object, Object, Object])
], IngestionService);

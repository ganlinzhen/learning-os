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
exports.ReviewService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../infrastructure/persistence/prisma.service");
const fsrs_adapter_1 = require("./fsrs-adapter");
let ReviewService = class ReviewService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getTodayCards() {
        return this.prisma.reviewCard.findMany({
            where: { dueAt: { lte: new Date() } },
            orderBy: { dueAt: "asc" },
            include: { concept: true },
        });
    }
    async submitAnswer(cardId, rating) {
        const card = await this.prisma.reviewCard.findUnique({
            where: { id: cardId },
        });
        const scheduled = (0, fsrs_adapter_1.applyRating)(card, rating);
        await this.prisma.reviewCard.update({
            where: { id: cardId },
            data: {
                dueAt: scheduled.card.due,
                stability: scheduled.card.stability,
                difficultyFsrs: scheduled.card.difficulty,
                elapsedDays: scheduled.card.elapsed_days,
                scheduledDays: scheduled.card.scheduled_days,
                reps: scheduled.card.reps,
                lapses: scheduled.card.lapses,
            },
        });
        await this.prisma.reviewLog.create({
            data: {
                cardId,
                conceptId: card.conceptId,
                rating,
                reviewedAt: new Date(),
                timeSpentSeconds: 0,
                nextDueAt: scheduled.card.due,
            },
        });
        return { cardId, rating, nextDueAt: scheduled.card.due };
    }
};
exports.ReviewService = ReviewService;
exports.ReviewService = ReviewService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(prisma_service_1.PrismaService)),
    __metadata("design:paramtypes", [Object])
], ReviewService);

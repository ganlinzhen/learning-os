import { Inject, Injectable } from "@nestjs/common";
import type { ReviewRating } from "@learning-os/contracts";
import { PrismaService } from "../../infrastructure/persistence/prisma.service";
import { applyRating } from "./fsrs-adapter";

@Injectable()
export class ReviewService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService | any) {}

  async getTodayCards() {
    return this.prisma.reviewCard.findMany({
      where: { dueAt: { lte: new Date() } },
      orderBy: { dueAt: "asc" },
      include: { concept: true },
    });
  }

  async submitAnswer(cardId: string, rating: ReviewRating) {
    const card = await this.prisma.reviewCard.findUnique({
      where: { id: cardId },
    });

    const scheduled = applyRating(card, rating);

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
}

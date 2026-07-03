import { Rating, createEmptyCard, fsrs } from "ts-fsrs";
import type { ReviewRating } from "@learning-os/contracts";

const scheduler = fsrs();

export function scheduleNextReview(card: {
  dueAt: Date;
  stability?: number;
  difficultyFsrs?: number;
  elapsedDays?: number;
  scheduledDays?: number;
  reps: number;
  lapses: number;
}) {
  const baseCard = createEmptyCard(card.dueAt);
  return {
    ...baseCard,
    due: card.dueAt,
    stability: card.stability ?? baseCard.stability,
    difficulty: card.difficultyFsrs ?? baseCard.difficulty,
    elapsed_days: card.elapsedDays ?? baseCard.elapsed_days,
    scheduled_days: card.scheduledDays ?? baseCard.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
  };
}

export function applyRating(
  card: {
    dueAt: Date;
    stability?: number;
    difficultyFsrs?: number;
    elapsedDays?: number;
    scheduledDays?: number;
    reps: number;
    lapses: number;
  },
  rating: ReviewRating,
) {
  const mappedRating =
    rating === "again" ? Rating.Again : rating === "hard" ? Rating.Hard : rating === "easy" ? Rating.Easy : Rating.Good;

  return scheduler.next(scheduleNextReview(card), new Date(), mappedRating);
}

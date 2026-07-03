"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduleNextReview = scheduleNextReview;
exports.applyRating = applyRating;
const ts_fsrs_1 = require("ts-fsrs");
const scheduler = (0, ts_fsrs_1.fsrs)();
function scheduleNextReview(card) {
    const baseCard = (0, ts_fsrs_1.createEmptyCard)(card.dueAt);
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
function applyRating(card, rating) {
    const mappedRating = rating === "again" ? ts_fsrs_1.Rating.Again : rating === "hard" ? ts_fsrs_1.Rating.Hard : rating === "easy" ? ts_fsrs_1.Rating.Easy : ts_fsrs_1.Rating.Good;
    return scheduler.next(scheduleNextReview(card), new Date(), mappedRating);
}

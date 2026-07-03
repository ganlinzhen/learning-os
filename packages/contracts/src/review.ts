export type ReviewRating = "again" | "hard" | "good" | "easy";

export interface ReviewCardDto {
  id: string;
  conceptId: string;
  conceptTitle: string;
  type: "qa" | "cloze";
  question: string;
  answer: string;
  dueAt: string;
}

export interface ReviewSubmissionDto {
  cardId: string;
  rating: ReviewRating;
}

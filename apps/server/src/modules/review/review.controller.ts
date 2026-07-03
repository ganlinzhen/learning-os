import { Body, Controller, Get, Inject, Param, Post } from "@nestjs/common";
import { ReviewService } from "./review.service";

@Controller("review")
export class ReviewController {
  constructor(@Inject(ReviewService) private readonly service: ReviewService) {}

  @Get("today")
  getTodayCards() {
    return this.service.getTodayCards();
  }

  @Post(":cardId")
  submitAnswer(
    @Param("cardId") cardId: string,
    @Body() body: { rating: "again" | "hard" | "good" | "easy" },
  ) {
    return this.service.submitAnswer(cardId, body.rating);
  }
}

import { Module } from "@nestjs/common";
import { AppConfigService } from "../../infrastructure/config/app-config.service";
import { PrismaService } from "../../infrastructure/persistence/prisma.service";
import { ReviewController } from "./review.controller";
import { ReviewService } from "./review.service";

@Module({
  controllers: [ReviewController],
  providers: [AppConfigService, ReviewService, PrismaService],
})
export class ReviewModule {}

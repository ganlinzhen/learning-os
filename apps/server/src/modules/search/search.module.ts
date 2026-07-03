import { Module } from "@nestjs/common";
import { AppConfigService } from "../../infrastructure/config/app-config.service";
import { PrismaService } from "../../infrastructure/persistence/prisma.service";
import { SearchController } from "./search.controller";
import { SearchService } from "./search.service";

@Module({
  controllers: [SearchController],
  providers: [AppConfigService, SearchService, PrismaService],
})
export class SearchModule {}

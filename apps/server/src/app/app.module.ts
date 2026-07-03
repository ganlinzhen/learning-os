import { Module } from "@nestjs/common";
import { AgentClientService } from "../infrastructure/agent/agent-client.service";
import { AppConfigService } from "../infrastructure/config/app-config.service";
import { PrismaService } from "../infrastructure/persistence/prisma.service";
import { StorageService } from "../infrastructure/storage/storage.service";
import { HealthController } from "../modules/health/health.controller";
import { IngestionModule } from "../modules/ingestion/ingestion.module";
import { LibraryModule } from "../modules/library/library.module";
import { ReviewModule } from "../modules/review/review.module";
import { SearchModule } from "../modules/search/search.module";

@Module({
  imports: [IngestionModule, LibraryModule, ReviewModule, SearchModule],
  controllers: [HealthController],
  providers: [AppConfigService, PrismaService, StorageService, AgentClientService],
})
export class AppModule {}

import { Module } from "@nestjs/common";
import { AgentClientService } from "../../infrastructure/agent/agent-client.service";
import { AppConfigService } from "../../infrastructure/config/app-config.service";
import { PrismaService } from "../../infrastructure/persistence/prisma.service";
import { StorageService } from "../../infrastructure/storage/storage.service";
import { IngestionController } from "./ingestion.controller";
import { IngestionService } from "./ingestion.service";

@Module({
  controllers: [IngestionController],
  providers: [AppConfigService, IngestionService, AgentClientService, StorageService, PrismaService],
  exports: [IngestionService],
})
export class IngestionModule {}

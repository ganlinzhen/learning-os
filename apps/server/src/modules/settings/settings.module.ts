import { Module } from "@nestjs/common";
import { AgentClientService } from "../../infrastructure/agent/agent-client.service";
import { AppConfigService } from "../../infrastructure/config/app-config.service";
import { LlmSettingsService } from "./llm-settings.service";
import { SettingsController } from "./settings.controller";

@Module({
  controllers: [SettingsController],
  providers: [AppConfigService, LlmSettingsService, AgentClientService],
})
export class SettingsModule {}

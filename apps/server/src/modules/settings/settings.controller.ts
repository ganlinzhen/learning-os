import { BadGatewayException, Body, Controller, Delete, Get, Inject, Post, Put } from "@nestjs/common";
import { UpdateLlmSettingsDto } from "@learning-os/contracts";
import { AgentClientService } from "../../infrastructure/agent/agent-client.service";
import { LlmSettingsService } from "./llm-settings.service";

@Controller("settings")
export class SettingsController {
  constructor(
    @Inject(LlmSettingsService) private readonly service: LlmSettingsService,
    @Inject(AgentClientService) private readonly agentClient: AgentClientService,
  ) {}

  @Get("llm")
  getLlmSettings() {
    return this.service.get();
  }

  @Put("llm")
  updateLlmSettings(@Body() input: UpdateLlmSettingsDto) {
    return this.service.save(input);
  }

  @Post("llm/test")
  async testLlmSettings(@Body() input: UpdateLlmSettingsDto) {
    const settings = await this.service.save(input);

    try {
      await this.agentClient.testLlmConnection();
    } catch {
      throw new BadGatewayException("LLM 连接测试失败，请检查配置后重试");
    }

    return settings;
  }

  @Delete("llm/api-key")
  clearLlmApiKey() {
    return this.service.clearApiKey();
  }
}

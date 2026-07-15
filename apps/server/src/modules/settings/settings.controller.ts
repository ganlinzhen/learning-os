import { BadGatewayException, BadRequestException, Body, Controller, Delete, Get, Inject, Post, Put } from "@nestjs/common";
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
    this.validateLlmSettingsInput(input);
    return this.service.save(input);
  }

  @Post("llm/test")
  async testLlmSettings(@Body() input: UpdateLlmSettingsDto) {
    this.validateLlmSettingsInput(input);
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

  private validateLlmSettingsInput(input: unknown): asserts input is UpdateLlmSettingsDto {
    if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length === 0) {
      throw new BadRequestException("LLM 设置请求体必须是非空对象");
    }
  }
}

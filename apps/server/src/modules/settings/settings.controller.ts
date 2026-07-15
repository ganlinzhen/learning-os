import { BadGatewayException, BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Headers, Inject, Post, Put } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import { UpdateLlmSettingsDto } from "@learning-os/contracts";
import { AgentClientService, AgentLlmConnectionError } from "../../infrastructure/agent/agent-client.service";
import { AppConfigService } from "../../infrastructure/config/app-config.service";
import { LlmSettingsService } from "./llm-settings.service";

@Controller("settings")
export class SettingsController {
  constructor(
    @Inject(LlmSettingsService) private readonly service: LlmSettingsService,
    @Inject(AgentClientService) private readonly agentClient: AgentClientService,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  @Get("llm")
  getLlmSettings() {
    return this.service.get();
  }

  @Put("llm")
  updateLlmSettings(@Body() input: UpdateLlmSettingsDto, @Headers("x-learning-os-token") token?: string) {
    this.validateWriteToken(token);
    this.validateLlmSettingsInput(input);
    return this.service.save(input);
  }

  @Post("llm/test")
  async testLlmSettings(@Body() input: UpdateLlmSettingsDto, @Headers("x-learning-os-token") token?: string) {
    this.validateWriteToken(token);
    this.validateLlmSettingsInput(input);
    let savedSettings: Awaited<ReturnType<LlmSettingsService["save"]>> | undefined;
    try {
      return await this.service.save(input, async (settings) => {
        savedSettings = settings;
        await this.agentClient.testLlmConnection();
      });
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      const code = error instanceof AgentLlmConnectionError ? error.code : "agent_request_failed";
      throw new BadGatewayException({
        code,
        message: "LLM 连接测试失败，请检查配置后重试",
        ...(savedSettings ? { settings: savedSettings } : {}),
      });
    }
  }

  @Delete("llm/api-key")
  clearLlmApiKey(@Headers("x-learning-os-token") token?: string) {
    this.validateWriteToken(token);
    return this.service.clearApiKey();
  }

  private validateWriteToken(token: string | undefined): void {
    const expected = this.config.apiToken;
    if (!expected || !token) {
      throw new ForbiddenException("设置写入未获授权");
    }
    const expectedBuffer = Buffer.from(expected);
    const tokenBuffer = Buffer.from(token);
    if (expectedBuffer.length !== tokenBuffer.length || !timingSafeEqual(expectedBuffer, tokenBuffer)) {
      throw new ForbiddenException("设置写入未获授权");
    }
  }

  private validateLlmSettingsInput(input: unknown): asserts input is UpdateLlmSettingsDto {
    if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length === 0) {
      throw new BadRequestException("LLM 设置请求体必须是非空对象");
    }
  }
}

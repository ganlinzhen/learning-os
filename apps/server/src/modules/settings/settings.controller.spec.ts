import { BadGatewayException, BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { SettingsController } from "./settings.controller";

const maskedSettings = {
  provider: "deepseek" as const,
  apiKeyConfigured: true,
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-v4-flash",
};
const validInput = {
  apiKey: "k",
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-v4-flash",
};

function createController() {
  const service = {
    get: vi.fn().mockResolvedValue(maskedSettings),
    save: vi.fn().mockResolvedValue(maskedSettings),
    clearApiKey: vi.fn().mockResolvedValue({ ...maskedSettings, apiKeyConfigured: false }),
  };
  const agent = { testLlmConnection: vi.fn().mockResolvedValue(undefined) };
  return { controller: new SettingsController(service as any, agent as any), service, agent };
}

describe("SettingsController", () => {
  it("读取、保存和清除 API 密钥时只返回脱敏设置", async () => {
    const { controller, service } = createController();

    const responses = await Promise.all([
      controller.getLlmSettings(),
      controller.updateLlmSettings(validInput),
      controller.testLlmSettings(validInput),
      controller.clearLlmApiKey(),
    ]);

    expect(responses).toEqual([maskedSettings, maskedSettings, maskedSettings, { ...maskedSettings, apiKeyConfigured: false }]);

    expect(service.get).toHaveBeenCalledOnce();
    expect(service.save).toHaveBeenCalledWith(validInput);
    expect(service.clearApiKey).toHaveBeenCalledOnce();
    for (const response of responses) {
      expect(response).not.toHaveProperty("apiKey");
    }
  });

  it("连接测试会先保存设置，再调用 Generator", async () => {
    const { controller, service, agent } = createController();

    await expect(controller.testLlmSettings(validInput)).resolves.toEqual(maskedSettings);

    expect(service.save).toHaveBeenCalledWith(validInput);
    expect(agent.testLlmConnection).toHaveBeenCalledOnce();
    expect(service.save.mock.invocationCallOrder[0]).toBeLessThan(agent.testLlmConnection.mock.invocationCallOrder[0]);
  });

  it("保留设置服务返回的无效输入异常", async () => {
    const { controller, service, agent } = createController();
    service.save.mockRejectedValueOnce(new BadRequestException("模型不能为空"));

    await expect(controller.testLlmSettings({ ...validInput, model: "" })).rejects.toBeInstanceOf(BadRequestException);
    expect(agent.testLlmConnection).not.toHaveBeenCalled();
  });

  it("连接测试失败时返回稳定的网关异常", async () => {
    const { controller, agent } = createController();
    agent.testLlmConnection.mockRejectedValueOnce(new Error("agent_request_failed"));

    await expect(controller.testLlmSettings(validInput)).rejects.toEqual(
      new BadGatewayException("LLM 连接测试失败，请检查配置后重试"),
    );
  });
});

import { BadGatewayException, BadRequestException, ForbiddenException } from "@nestjs/common";
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
    save: vi.fn(async (_input, afterSave) => {
      await afterSave?.(maskedSettings);
      return maskedSettings;
    }),
    clearApiKey: vi.fn().mockResolvedValue({ ...maskedSettings, apiKeyConfigured: false }),
  };
  const agent = { testLlmConnection: vi.fn().mockResolvedValue(undefined) };
  const config = { apiToken: "test-token" };
  return { controller: new SettingsController(service as any, agent as any, config as any), service, agent };
}

describe("SettingsController", () => {
  it("读取、保存和清除 API 密钥时只返回脱敏设置", async () => {
    const { controller, service } = createController();

    const responses = await Promise.all([
      controller.getLlmSettings(),
      controller.updateLlmSettings(validInput, "test-token"),
      controller.testLlmSettings(validInput, "test-token"),
      controller.clearLlmApiKey("test-token"),
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

    await expect(controller.testLlmSettings(validInput, "test-token")).resolves.toEqual(maskedSettings);

    expect(service.save).toHaveBeenCalledWith(validInput, expect.any(Function));
    expect(agent.testLlmConnection).toHaveBeenCalledOnce();
    expect(service.save.mock.invocationCallOrder[0]).toBeLessThan(agent.testLlmConnection.mock.invocationCallOrder[0]);
  });

  it("保留设置服务返回的无效输入异常", async () => {
    const { controller, service, agent } = createController();
    service.save.mockRejectedValueOnce(new BadRequestException("模型不能为空"));

    await expect(controller.testLlmSettings({ ...validInput, model: "" }, "test-token")).rejects.toBeInstanceOf(BadRequestException);
    expect(agent.testLlmConnection).not.toHaveBeenCalled();
  });

  it.each([undefined, null])("拒绝 PUT 与 POST 的空请求体：%s", async (input) => {
    const { controller, service, agent } = createController();
    const expectedError = new BadRequestException("LLM 设置请求体必须是非空对象");

    expect(() => controller.updateLlmSettings(input as any, "test-token")).toThrow(expectedError);
    await expect(controller.testLlmSettings(input as any, "test-token")).rejects.toEqual(expectedError);

    expect(service.save).not.toHaveBeenCalled();
    expect(agent.testLlmConnection).not.toHaveBeenCalled();
  });

  it("连接测试失败时返回稳定的网关异常", async () => {
    const { controller, agent } = createController();
    agent.testLlmConnection.mockRejectedValueOnce(new Error("agent_request_failed"));

    await expect(controller.testLlmSettings(validInput, "test-token")).rejects.toMatchObject({
      response: expect.objectContaining({ code: "agent_request_failed", settings: maskedSettings }),
    });
  });

  it("拒绝没有受控令牌的设置写入", () => {
    const { controller, service } = createController();

    expect(() => controller.updateLlmSettings(validInput, "attacker-token")).toThrow(ForbiddenException);
    expect(service.save).not.toHaveBeenCalled();
  });
});

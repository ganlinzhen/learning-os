import { BadRequestException, InternalServerErrorException } from "@nestjs/common";
import { OPTIONAL_DEPS_METADATA } from "@nestjs/common/constants";
import { Test } from "@nestjs/testing";
import "reflect-metadata";
import { mkdtempSync } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AppConfigService } from "../../infrastructure/config/app-config.service";
import { LlmSettingsService } from "./llm-settings.service";

describe("LlmSettingsService", () => {
  it("首次读取返回默认 DeepSeek 配置且不泄露密钥", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "learning-os-llm-settings-")), "llm.json");
    const service = new LlmSettingsService({ llmConfigPath: path } as any);

    await expect(service.get()).resolves.toEqual({
      provider: "deepseek",
      apiKeyConfigured: false,
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-flash",
    });
  });

  it("由应用配置提供可被环境变量覆盖的 LLM 配置路径", () => {
    const config = new AppConfigService();

    expect(config.llmConfigPath).toBe(
      process.env.LEARNING_OS_LLM_CONFIG_PATH ?? join(config.appRootDir, "settings", "llm.json"),
    );
  });

  it("可在未提供测试文件系统时由 Nest 构造", async () => {
    const module = await Test.createTestingModule({
      providers: [
        LlmSettingsService,
        { provide: AppConfigService, useValue: { llmConfigPath: "/tmp/learning-os/llm.json" } },
      ],
    }).compile();

    expect(module.get(LlmSettingsService)).toBeInstanceOf(LlmSettingsService);
  });

  it("将测试文件系统声明为 Nest 可选依赖", () => {
    expect(Reflect.getMetadata(OPTIONAL_DEPS_METADATA, LlmSettingsService)).toContain(1);
  });

  it("拒绝损坏的本地配置 JSON", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "learning-os-llm-settings-")), "llm.json");
    await writeFile(path, "{", "utf8");
    const service = new LlmSettingsService({ llmConfigPath: path } as any);

    await expect(service.get()).rejects.toBeInstanceOf(BadRequestException);
  });

  it("拒绝除 ENOENT 之外的本地配置读取错误", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "learning-os-llm-settings-")), "llm.json");
    const error = Object.assign(new Error("权限不足"), { code: "EACCES" });
    const service = new LlmSettingsService(
      { llmConfigPath: path } as any,
      { readFile: async () => Promise.reject(error) } as any,
    );

    await expect(service.get()).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it("保存原子写入并在空密钥时保留旧密钥", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "learning-os-llm-settings-")), "llm.json");
    const service = new LlmSettingsService({ llmConfigPath: path } as any);

    await service.save({
      apiKey: "secret",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-flash",
    });
    await service.save({
      apiKey: "",
      baseUrl: "https://proxy.example/v1",
      model: "deepseek-chat",
    });

    expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({
      apiKey: "secret",
      baseUrl: "https://proxy.example/v1",
      model: "deepseek-chat",
    });
  });

  it("读取已保存的真实密钥时 DTO 不包含 apiKey", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "learning-os-llm-settings-")), "llm.json");
    const service = new LlmSettingsService({ llmConfigPath: path } as any);
    await service.save({
      apiKey: "真实密钥",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-flash",
    });

    const settings = await service.get();

    expect(settings).toMatchObject({ apiKeyConfigured: true });
    expect(settings).not.toHaveProperty("apiKey");
  });

  it("在 POSIX 平台上以仅所有者可读写权限保存配置", async () => {
    if (process.platform === "win32") {
      return;
    }

    const path = join(mkdtempSync(join(tmpdir(), "learning-os-llm-settings-")), "llm.json");
    const service = new LlmSettingsService({ llmConfigPath: path } as any);

    await service.save({ baseUrl: "https://api.deepseek.com", model: "deepseek-v4-flash" });

    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });

  it("清除密钥时保留 Base URL 和模型且不写入 apiKey", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "learning-os-llm-settings-")), "llm.json");
    const service = new LlmSettingsService({ llmConfigPath: path } as any);
    await service.save({
      apiKey: "secret",
      baseUrl: "https://proxy.example/v1",
      model: "deepseek-chat",
    });

    await expect(service.clearApiKey()).resolves.toEqual({
      provider: "deepseek",
      apiKeyConfigured: false,
      baseUrl: "https://proxy.example/v1",
      model: "deepseek-chat",
    });
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({
      baseUrl: "https://proxy.example/v1",
      model: "deepseek-chat",
    });
  });

  it("原子写入失败时清理同目录临时文件", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "learning-os-llm-settings-"));
    const path = join(rootDir, "llm.json");
    await mkdir(path);
    const service = new LlmSettingsService({ llmConfigPath: path } as any);

    await expect(
      service.save({ baseUrl: "https://api.deepseek.com", model: "deepseek-v4-flash" }),
    ).rejects.toBeDefined();

    expect(await readdir(rootDir)).toEqual(["llm.json"]);
  });

  it("写入临时文件失败时清理临时文件", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "learning-os-llm-settings-"));
    const path = join(rootDir, "llm.json");
    const service = new LlmSettingsService(
      { llmConfigPath: path } as any,
      {
        writeFile: async (...args: Parameters<typeof writeFile>) => {
          await writeFile(...args);
          throw new Error("模拟写入失败");
        },
      } as any,
    );

    await expect(
      service.save({ baseUrl: "https://api.deepseek.com", model: "deepseek-v4-flash" }),
    ).rejects.toThrow("模拟写入失败");

    expect(await readdir(rootDir)).toEqual([]);
  });

  it.each(["ftp://host", "not-a-url"])("拒绝非 HTTP(S) Base URL", async (baseUrl) => {
    const path = join(mkdtempSync(join(tmpdir(), "learning-os-llm-settings-")), "llm.json");
    const service = new LlmSettingsService({ llmConfigPath: path } as any);

    await expect(service.save({ baseUrl, model: "m" })).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    ["baseUrl", { baseUrl: 1, model: "m" }],
    ["model", { baseUrl: "https://api.deepseek.com", model: 1 }],
    ["apiKey", { apiKey: 1, baseUrl: "https://api.deepseek.com", model: "m" }],
  ])("拒绝非字符串 %s", async (_field, input) => {
    const path = join(mkdtempSync(join(tmpdir(), "learning-os-llm-settings-")), "llm.json");
    const service = new LlmSettingsService({ llmConfigPath: path } as any);

    await expect(service.save(input as any)).rejects.toBeInstanceOf(BadRequestException);
  });
});

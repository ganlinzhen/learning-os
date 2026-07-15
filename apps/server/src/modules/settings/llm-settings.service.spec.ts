import { BadRequestException } from "@nestjs/common";
import { mkdtempSync } from "node:fs";
import { mkdir, readFile, readdir, stat } from "node:fs/promises";
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

  it.each(["ftp://host", "not-a-url"])("拒绝非 HTTP(S) Base URL", async (baseUrl) => {
    const path = join(mkdtempSync(join(tmpdir(), "learning-os-llm-settings-")), "llm.json");
    const service = new LlmSettingsService({ llmConfigPath: path } as any);

    await expect(service.save({ baseUrl, model: "m" })).rejects.toBeInstanceOf(BadRequestException);
  });
});

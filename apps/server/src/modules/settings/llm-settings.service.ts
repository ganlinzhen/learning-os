import { BadRequestException, Inject, Injectable, InternalServerErrorException } from "@nestjs/common";
import { LlmSettingsDto, UpdateLlmSettingsDto } from "@learning-os/contracts";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { AppConfigService } from "../../infrastructure/config/app-config.service";

interface StoredLlmSettings {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-v4-flash";
const DEFAULT_FILE_SYSTEM = { mkdir, readFile, rename, unlink, writeFile };
type LlmSettingsFileSystem = typeof DEFAULT_FILE_SYSTEM;

@Injectable()
export class LlmSettingsService {
  private readonly fileSystem: LlmSettingsFileSystem;

  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
    fileSystem: Partial<LlmSettingsFileSystem> = {},
  ) {
    this.fileSystem = { ...DEFAULT_FILE_SYSTEM, ...fileSystem };
  }

  async get(): Promise<LlmSettingsDto> {
    return this.toDto(await this.readSettings());
  }

  async save(input: UpdateLlmSettingsDto): Promise<LlmSettingsDto> {
    const current = await this.readSettings();
    const apiKey = this.validateApiKey(input.apiKey) ?? current.apiKey;
    const settings: StoredLlmSettings = {
      ...(apiKey ? { apiKey } : {}),
      baseUrl: this.validateBaseUrl(input.baseUrl),
      model: this.validateModel(input.model),
    };

    await this.writeSettings(settings);
    return this.toDto(settings);
  }

  async clearApiKey(): Promise<LlmSettingsDto> {
    const current = await this.readSettings();
    const settings: StoredLlmSettings = {
      baseUrl: this.getValidBaseUrl(current.baseUrl),
      model: this.getValidModel(current.model),
    };

    await this.writeSettings(settings);
    return this.toDto(settings);
  }

  private async readSettings(): Promise<StoredLlmSettings> {
    let content: string;
    try {
      content = await this.fileSystem.readFile(this.config.llmConfigPath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return {};
      }
      throw new InternalServerErrorException("无法读取 LLM 配置");
    }

    let raw: unknown;
    try {
      raw = JSON.parse(content);
    } catch {
      throw new BadRequestException("LLM 配置文件格式无效");
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new BadRequestException("LLM 配置文件格式无效");
    }

    const settings = raw as Record<string, unknown>;
    return {
      ...(settings.apiKey === undefined ? {} : { apiKey: this.validateApiKey(settings.apiKey) }),
      ...(settings.baseUrl === undefined ? {} : { baseUrl: this.validateBaseUrl(settings.baseUrl) }),
      ...(settings.model === undefined ? {} : { model: this.validateModel(settings.model) }),
    };
  }

  private async writeSettings(settings: StoredLlmSettings): Promise<void> {
    const directory = dirname(this.config.llmConfigPath);
    const temporaryPath = join(
      directory,
      `.${basename(this.config.llmConfigPath)}.${randomUUID()}.tmp`,
    );
    await this.fileSystem.mkdir(directory, { recursive: true });

    try {
      await this.fileSystem.writeFile(temporaryPath, JSON.stringify(settings), { encoding: "utf8", mode: 0o600 });
      await this.fileSystem.rename(temporaryPath, this.config.llmConfigPath);
    } catch (error) {
      await this.fileSystem.unlink(temporaryPath).catch(() => undefined);
      throw error;
    }
  }

  private toDto(settings: StoredLlmSettings): LlmSettingsDto {
    return {
      provider: "deepseek",
      apiKeyConfigured: Boolean(settings.apiKey),
      baseUrl: this.getValidBaseUrl(settings.baseUrl),
      model: this.getValidModel(settings.model),
    };
  }

  private getValidBaseUrl(baseUrl: string | undefined): string {
    try {
      return baseUrl && this.validateBaseUrl(baseUrl) ? baseUrl : DEFAULT_BASE_URL;
    } catch {
      return DEFAULT_BASE_URL;
    }
  }

  private validateBaseUrl(baseUrl: unknown): string {
    if (typeof baseUrl !== "string") {
      throw new BadRequestException("Base URL 必须是字符串");
    }
    const value = baseUrl.trim();
    try {
      const url = new URL(value);
      if (!value || (url.protocol !== "http:" && url.protocol !== "https:")) {
        throw new Error();
      }
      return value;
    } catch {
      throw new BadRequestException("Base URL 必须是 HTTP(S) 地址");
    }
  }

  private getValidModel(model: string | undefined): string {
    try {
      return model && this.validateModel(model) ? model : DEFAULT_MODEL;
    } catch {
      return DEFAULT_MODEL;
    }
  }

  private validateModel(model: unknown): string {
    if (typeof model !== "string") {
      throw new BadRequestException("模型必须是字符串");
    }
    const value = model.trim();
    if (!value) {
      throw new BadRequestException("模型不能为空");
    }
    return value;
  }

  private validateApiKey(apiKey: unknown): string | undefined {
    if (apiKey === undefined) {
      return undefined;
    }
    if (typeof apiKey !== "string") {
      throw new BadRequestException("API 密钥必须是字符串");
    }
    return apiKey.trim() || undefined;
  }
}

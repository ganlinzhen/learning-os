import { BadRequestException, Inject, Injectable } from "@nestjs/common";
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

@Injectable()
export class LlmSettingsService {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async get(): Promise<LlmSettingsDto> {
    return this.toDto(await this.readSettings());
  }

  async save(input: UpdateLlmSettingsDto): Promise<LlmSettingsDto> {
    const current = await this.readSettings();
    const apiKey = input.apiKey?.trim() || current.apiKey;
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
    try {
      const raw = JSON.parse(await readFile(this.config.llmConfigPath, "utf8"));
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return {};
      }
      return {
        ...(typeof raw.apiKey === "string" && raw.apiKey.trim() ? { apiKey: raw.apiKey.trim() } : {}),
        ...(typeof raw.baseUrl === "string" ? { baseUrl: raw.baseUrl.trim() } : {}),
        ...(typeof raw.model === "string" ? { model: raw.model.trim() } : {}),
      };
    } catch {
      return {};
    }
  }

  private async writeSettings(settings: StoredLlmSettings): Promise<void> {
    const directory = dirname(this.config.llmConfigPath);
    const temporaryPath = join(
      directory,
      `.${basename(this.config.llmConfigPath)}.${randomUUID()}.tmp`,
    );
    await mkdir(directory, { recursive: true });

    try {
      await writeFile(temporaryPath, JSON.stringify(settings), { encoding: "utf8", mode: 0o600 });
      await rename(temporaryPath, this.config.llmConfigPath);
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined);
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

  private validateBaseUrl(baseUrl: string): string {
    const value = baseUrl?.trim();
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

  private validateModel(model: string): string {
    const value = model?.trim();
    if (!value) {
      throw new BadRequestException("模型不能为空");
    }
    return value;
  }
}

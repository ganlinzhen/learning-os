"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LlmSettingsService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const app_config_service_1 = require("../../infrastructure/config/app-config.service");
const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-v4-flash";
const DEFAULT_FILE_SYSTEM = { mkdir: promises_1.mkdir, readFile: promises_1.readFile, rename: promises_1.rename, unlink: promises_1.unlink, writeFile: promises_1.writeFile };
let LlmSettingsService = class LlmSettingsService {
    config;
    fileSystem;
    mutationQueue = Promise.resolve();
    constructor(config, fileSystem = {}) {
        this.config = config;
        this.fileSystem = { ...DEFAULT_FILE_SYSTEM, ...fileSystem };
    }
    async get() {
        return this.runExclusively(async () => this.toDto(await this.readSettings()));
    }
    async save(input, afterSave) {
        return this.runExclusively(async () => {
            const current = await this.readSettings();
            const apiKey = this.validateApiKey(input.apiKey) ?? current.apiKey;
            const settings = {
                ...(apiKey ? { apiKey } : {}),
                baseUrl: this.validateBaseUrl(input.baseUrl),
                model: this.validateModel(input.model),
            };
            await this.writeSettings(settings);
            const dto = this.toDto(settings);
            await afterSave?.(dto);
            return dto;
        });
    }
    async clearApiKey() {
        return this.runExclusively(async () => {
            const current = await this.readSettings();
            const settings = {
                baseUrl: this.getValidBaseUrl(current.baseUrl),
                model: this.getValidModel(current.model),
            };
            await this.writeSettings(settings);
            return this.toDto(settings);
        });
    }
    async runExclusively(operation) {
        const previous = this.mutationQueue;
        let release;
        this.mutationQueue = new Promise((resolve) => {
            release = resolve;
        });
        await previous.catch(() => undefined);
        try {
            return await operation();
        }
        finally {
            release();
        }
    }
    async readSettings() {
        let content;
        try {
            content = await this.fileSystem.readFile(this.config.llmConfigPath, "utf8");
        }
        catch (error) {
            if (error.code === "ENOENT") {
                return {};
            }
            throw new common_1.InternalServerErrorException("无法读取 LLM 配置");
        }
        let raw;
        try {
            raw = JSON.parse(content);
        }
        catch {
            throw new common_1.BadRequestException("LLM 配置文件格式无效");
        }
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
            throw new common_1.BadRequestException("LLM 配置文件格式无效");
        }
        const settings = raw;
        return {
            ...(settings.apiKey === undefined ? {} : { apiKey: this.validateApiKey(settings.apiKey) }),
            ...(settings.baseUrl === undefined ? {} : { baseUrl: this.validateBaseUrl(settings.baseUrl) }),
            ...(settings.model === undefined ? {} : { model: this.validateModel(settings.model) }),
        };
    }
    async writeSettings(settings) {
        const directory = (0, node_path_1.dirname)(this.config.llmConfigPath);
        const temporaryPath = (0, node_path_1.join)(directory, `.${(0, node_path_1.basename)(this.config.llmConfigPath)}.${(0, node_crypto_1.randomUUID)()}.tmp`);
        await this.fileSystem.mkdir(directory, { recursive: true });
        try {
            await this.fileSystem.writeFile(temporaryPath, JSON.stringify(settings), { encoding: "utf8", mode: 0o600 });
            await this.fileSystem.rename(temporaryPath, this.config.llmConfigPath);
        }
        catch (error) {
            await this.fileSystem.unlink(temporaryPath).catch(() => undefined);
            throw error;
        }
    }
    toDto(settings) {
        return {
            provider: "deepseek",
            apiKeyConfigured: Boolean(settings.apiKey),
            baseUrl: this.getValidBaseUrl(settings.baseUrl),
            model: this.getValidModel(settings.model),
        };
    }
    getValidBaseUrl(baseUrl) {
        try {
            return baseUrl && this.validateBaseUrl(baseUrl) ? baseUrl : DEFAULT_BASE_URL;
        }
        catch {
            return DEFAULT_BASE_URL;
        }
    }
    validateBaseUrl(baseUrl) {
        if (typeof baseUrl !== "string") {
            throw new common_1.BadRequestException("Base URL 必须是字符串");
        }
        const value = baseUrl.trim();
        try {
            const url = new URL(value);
            if (!value || (url.protocol !== "http:" && url.protocol !== "https:")) {
                throw new Error();
            }
            return value;
        }
        catch {
            throw new common_1.BadRequestException("Base URL 必须是 HTTP(S) 地址");
        }
    }
    getValidModel(model) {
        try {
            return model && this.validateModel(model) ? model : DEFAULT_MODEL;
        }
        catch {
            return DEFAULT_MODEL;
        }
    }
    validateModel(model) {
        if (typeof model !== "string") {
            throw new common_1.BadRequestException("模型必须是字符串");
        }
        const value = model.trim();
        if (!value) {
            throw new common_1.BadRequestException("模型不能为空");
        }
        return value;
    }
    validateApiKey(apiKey) {
        if (apiKey === undefined) {
            return undefined;
        }
        if (typeof apiKey !== "string") {
            throw new common_1.BadRequestException("API 密钥必须是字符串");
        }
        return apiKey.trim() || undefined;
    }
};
exports.LlmSettingsService = LlmSettingsService;
exports.LlmSettingsService = LlmSettingsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(app_config_service_1.AppConfigService)),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [app_config_service_1.AppConfigService, Object])
], LlmSettingsService);

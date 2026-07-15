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
exports.SettingsController = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const agent_client_service_1 = require("../../infrastructure/agent/agent-client.service");
const app_config_service_1 = require("../../infrastructure/config/app-config.service");
const llm_settings_service_1 = require("./llm-settings.service");
let SettingsController = class SettingsController {
    service;
    agentClient;
    config;
    constructor(service, agentClient, config) {
        this.service = service;
        this.agentClient = agentClient;
        this.config = config;
    }
    getLlmSettings() {
        return this.service.get();
    }
    updateLlmSettings(input, token) {
        this.validateWriteToken(token);
        this.validateLlmSettingsInput(input);
        return this.service.save(input);
    }
    async testLlmSettings(input, token) {
        this.validateWriteToken(token);
        this.validateLlmSettingsInput(input);
        let savedSettings;
        try {
            return await this.service.save(input, async (settings) => {
                savedSettings = settings;
                await this.agentClient.testLlmConnection();
            });
        }
        catch (error) {
            if (error instanceof common_1.BadRequestException) {
                throw error;
            }
            const code = error instanceof agent_client_service_1.AgentLlmConnectionError ? error.code : "agent_request_failed";
            throw new common_1.BadGatewayException({
                code,
                message: "LLM 连接测试失败，请检查配置后重试",
                ...(savedSettings ? { settings: savedSettings } : {}),
            });
        }
    }
    clearLlmApiKey(token) {
        this.validateWriteToken(token);
        return this.service.clearApiKey();
    }
    validateWriteToken(token) {
        const expected = this.config.apiToken;
        if (!expected || !token) {
            throw new common_1.ForbiddenException("设置写入未获授权");
        }
        const expectedBuffer = Buffer.from(expected);
        const tokenBuffer = Buffer.from(token);
        if (expectedBuffer.length !== tokenBuffer.length || !(0, node_crypto_1.timingSafeEqual)(expectedBuffer, tokenBuffer)) {
            throw new common_1.ForbiddenException("设置写入未获授权");
        }
    }
    validateLlmSettingsInput(input) {
        if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length === 0) {
            throw new common_1.BadRequestException("LLM 设置请求体必须是非空对象");
        }
    }
};
exports.SettingsController = SettingsController;
__decorate([
    (0, common_1.Get)("llm"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], SettingsController.prototype, "getLlmSettings", null);
__decorate([
    (0, common_1.Put)("llm"),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Headers)("x-learning-os-token")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], SettingsController.prototype, "updateLlmSettings", null);
__decorate([
    (0, common_1.Post)("llm/test"),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Headers)("x-learning-os-token")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], SettingsController.prototype, "testLlmSettings", null);
__decorate([
    (0, common_1.Delete)("llm/api-key"),
    __param(0, (0, common_1.Headers)("x-learning-os-token")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], SettingsController.prototype, "clearLlmApiKey", null);
exports.SettingsController = SettingsController = __decorate([
    (0, common_1.Controller)("settings"),
    __param(0, (0, common_1.Inject)(llm_settings_service_1.LlmSettingsService)),
    __param(1, (0, common_1.Inject)(agent_client_service_1.AgentClientService)),
    __param(2, (0, common_1.Inject)(app_config_service_1.AppConfigService)),
    __metadata("design:paramtypes", [llm_settings_service_1.LlmSettingsService,
        agent_client_service_1.AgentClientService,
        app_config_service_1.AppConfigService])
], SettingsController);

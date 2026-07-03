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
exports.AgentClientService = void 0;
const common_1 = require("@nestjs/common");
const app_config_service_1 = require("../config/app-config.service");
let AgentClientService = class AgentClientService {
    fetchImpl;
    resolvedBaseUrl;
    appConfig;
    constructor(config, options) {
        this.appConfig = config;
        this.fetchImpl = options?.fetchImpl ?? fetch;
        this.resolvedBaseUrl = options?.baseUrl;
    }
    async generateCandidates(input) {
        const url = this.resolvedBaseUrl ?? this.appConfig?.agentBaseUrl ?? "http://127.0.0.1:8000";
        const response = await this.fetchImpl(`${url}/generate`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(input),
        });
        if (!response.ok) {
            throw new Error("agent_request_failed");
        }
        return response.json();
    }
};
exports.AgentClientService = AgentClientService;
exports.AgentClientService = AgentClientService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(0, (0, common_1.Inject)(app_config_service_1.AppConfigService)),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [app_config_service_1.AppConfigService, Object])
], AgentClientService);

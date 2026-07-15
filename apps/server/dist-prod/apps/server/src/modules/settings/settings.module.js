"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsModule = void 0;
const common_1 = require("@nestjs/common");
const agent_client_service_1 = require("../../infrastructure/agent/agent-client.service");
const app_config_service_1 = require("../../infrastructure/config/app-config.service");
const llm_settings_service_1 = require("./llm-settings.service");
const settings_controller_1 = require("./settings.controller");
let SettingsModule = class SettingsModule {
};
exports.SettingsModule = SettingsModule;
exports.SettingsModule = SettingsModule = __decorate([
    (0, common_1.Module)({
        controllers: [settings_controller_1.SettingsController],
        providers: [app_config_service_1.AppConfigService, llm_settings_service_1.LlmSettingsService, agent_client_service_1.AgentClientService],
    })
], SettingsModule);

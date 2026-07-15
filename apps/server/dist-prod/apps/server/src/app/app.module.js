"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const agent_client_service_1 = require("../infrastructure/agent/agent-client.service");
const app_config_service_1 = require("../infrastructure/config/app-config.service");
const prisma_service_1 = require("../infrastructure/persistence/prisma.service");
const storage_service_1 = require("../infrastructure/storage/storage.service");
const health_controller_1 = require("../modules/health/health.controller");
const ingestion_module_1 = require("../modules/ingestion/ingestion.module");
const library_module_1 = require("../modules/library/library.module");
const review_module_1 = require("../modules/review/review.module");
const search_module_1 = require("../modules/search/search.module");
const settings_module_1 = require("../modules/settings/settings.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [ingestion_module_1.IngestionModule, library_module_1.LibraryModule, review_module_1.ReviewModule, search_module_1.SearchModule, settings_module_1.SettingsModule],
        controllers: [health_controller_1.HealthController],
        providers: [app_config_service_1.AppConfigService, prisma_service_1.PrismaService, storage_service_1.StorageService, agent_client_service_1.AgentClientService],
    })
], AppModule);

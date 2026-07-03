"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppConfigService = void 0;
const common_1 = require("@nestjs/common");
const node_path_1 = require("node:path");
let AppConfigService = class AppConfigService {
    appRootDir = process.env.LEARNING_OS_ROOT_DIR ?? (0, node_path_1.join)(process.cwd(), ".learning-os");
    apiPort = Number(process.env.LEARNING_OS_API_PORT ?? "3000");
    agentBaseUrl = process.env.LEARNING_OS_AGENT_URL ?? "http://127.0.0.1:8000";
    databasePath = process.env.LEARNING_OS_DB_PATH ?? (0, node_path_1.join)(this.appRootDir, "data", "learning-os.db");
    databaseUrl = process.env.DATABASE_URL ?? `file:${this.databasePath}`;
};
exports.AppConfigService = AppConfigService;
exports.AppConfigService = AppConfigService = __decorate([
    (0, common_1.Injectable)()
], AppConfigService);

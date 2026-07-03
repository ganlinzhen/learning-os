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
exports.StorageService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const app_config_service_1 = require("../config/app-config.service");
let StorageService = class StorageService {
    config;
    constructor(config) {
        this.config = config;
    }
    async saveSourceContent(input) {
        const safeName = input.title.trim().replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/^-|-$/g, "") || "untitled";
        const ext = input.type === "markdown" ? "md" : "txt";
        const dir = (0, node_path_1.join)(this.config.appRootDir, "sources");
        await (0, promises_1.mkdir)(dir, { recursive: true });
        const localPath = (0, node_path_1.join)(dir, `${Date.now()}-${safeName}.${ext}`);
        await (0, promises_1.writeFile)(localPath, input.content, "utf8");
        const contentHash = (0, node_crypto_1.createHash)("sha256").update(input.content).digest("hex");
        return { localPath, contentHash };
    }
};
exports.StorageService = StorageService;
exports.StorageService = StorageService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(app_config_service_1.AppConfigService)),
    __metadata("design:paramtypes", [app_config_service_1.AppConfigService])
], StorageService);

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
const web_content_service_1 = require("../web/web-content.service");
let StorageService = class StorageService {
    config;
    webContentService;
    constructor(config, webContentService) {
        this.config = config;
        this.webContentService = webContentService ?? new web_content_service_1.WebContentService();
    }
    async resolveImportContent(input) {
        if (input.type === "url") {
            const url = this.getNonEmptyText(input.url);
            if (!url) {
                throw new web_content_service_1.WebContentError("web_url_invalid");
            }
            const resolved = await this.webContentService.fetch(url);
            const title = this.requireText(this.getNonEmptyText(input.title) ?? resolved.title, "web_content_empty");
            const content = this.requireText(resolved.content, "web_content_empty");
            return { title, content, url };
        }
        const content = this.requireText(input.content);
        const title = this.requireText(this.getNonEmptyText(input.title) ?? (input.type === "markdown" ? this.getMarkdownTitle(content) : undefined));
        return { title, content };
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
    async replaceSourceContent(input) {
        const temporaryPath = (0, node_path_1.join)((0, node_path_1.dirname)(input.localPath), `.${(0, node_path_1.basename)(input.localPath)}.${(0, node_crypto_1.randomUUID)()}.tmp`);
        try {
            await (0, promises_1.writeFile)(temporaryPath, input.content, "utf8");
            await (0, promises_1.rename)(temporaryPath, input.localPath);
        }
        catch (error) {
            await (0, promises_1.unlink)(temporaryPath).catch(() => undefined);
            throw error;
        }
        const contentHash = (0, node_crypto_1.createHash)("sha256").update(input.content).digest("hex");
        return { localPath: input.localPath, contentHash };
    }
    async writeNotes(inputs) {
        const dir = (0, node_path_1.join)(this.config.appRootDir, "notes");
        await (0, promises_1.mkdir)(dir, { recursive: true });
        const writtenPaths = [];
        const notes = [];
        try {
            for (const input of inputs) {
                const localPath = (0, node_path_1.join)(dir, `${this.safeFileStem(input.title)}-${input.conceptId}.md`);
                const temporaryPath = (0, node_path_1.join)(dir, `.${(0, node_path_1.basename)(localPath)}.${(0, node_crypto_1.randomUUID)()}.tmp`);
                const content = this.buildNoteContent(input);
                try {
                    await (0, promises_1.writeFile)(temporaryPath, content, "utf8");
                    await (0, promises_1.rename)(temporaryPath, localPath);
                }
                catch (error) {
                    await this.removeFiles([temporaryPath]);
                    throw error;
                }
                writtenPaths.push(localPath);
                notes.push({ title: input.title, content, localPath });
            }
            return notes;
        }
        catch (error) {
            await this.removeFiles(writtenPaths);
            throw error;
        }
    }
    async removeFiles(paths) {
        await Promise.all(paths.map(async (path) => {
            try {
                await (0, promises_1.unlink)(path);
            }
            catch (error) {
                if (error.code !== "ENOENT") {
                    throw error;
                }
            }
        }));
    }
    buildNoteContent(input) {
        const cards = input.cards.map((card) => `### ${card.question}\n\n${card.answer}`).join("\n\n");
        return [
            "---",
            `conceptId: ${input.conceptId}`,
            `sourceId: ${input.sourceId}`,
            `createdAt: ${new Date().toISOString()}`,
            "tags: []",
            "---",
            "",
            `# ${input.title}`,
            "",
            "## 摘要",
            "",
            input.summary,
            "",
            "## 核心解释",
            "",
            input.summary,
            "",
            "## 证据",
            "",
            input.evidence,
            "",
            "## 复习卡片",
            "",
            cards,
            "",
        ].join("\n");
    }
    safeFileStem(title) {
        return title.trim().replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/g, "") || "untitled";
    }
    getMarkdownTitle(content) {
        const title = /^\s{0,3}#(?!#)\s+(.+?)\s*$/m.exec(content)?.[1]?.trim();
        return title?.replace(/[ \t]+#+$/, "").trim();
    }
    getNonEmptyText(value) {
        const text = value?.trim();
        return text || undefined;
    }
    requireText(value, errorCode) {
        const text = this.getNonEmptyText(value);
        if (!text) {
            if (errorCode) {
                throw new web_content_service_1.WebContentError(errorCode);
            }
            throw new Error("导入内容必须提供非空标题和正文");
        }
        return text;
    }
};
exports.StorageService = StorageService;
exports.StorageService = StorageService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(app_config_service_1.AppConfigService)),
    __param(1, (0, common_1.Optional)()),
    __param(1, (0, common_1.Inject)(web_content_service_1.WebContentService)),
    __metadata("design:paramtypes", [app_config_service_1.AppConfigService,
        web_content_service_1.WebContentService])
], StorageService);

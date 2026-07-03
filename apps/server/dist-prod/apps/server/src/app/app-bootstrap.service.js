"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppBootstrapService = void 0;
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
class AppBootstrapService {
    rootDir;
    constructor(rootDir) {
        this.rootDir = rootDir;
    }
    async ensureDirectories() {
        const dirs = ["config", "data", "sources", "notes", "vectors", "exports", "logs", "backups"];
        await Promise.all(dirs.map((dir) => (0, promises_1.mkdir)((0, node_path_1.join)(this.rootDir, dir), { recursive: true })));
    }
}
exports.AppBootstrapService = AppBootstrapService;

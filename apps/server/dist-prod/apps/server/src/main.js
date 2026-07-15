"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SERVER_LISTEN_HOST = void 0;
exports.createCorsOptions = createCorsOptions;
require("reflect-metadata");
const core_1 = require("@nestjs/core");
const app_bootstrap_service_1 = require("./app/app-bootstrap.service");
const app_module_1 = require("./app/app.module");
const app_config_service_1 = require("./infrastructure/config/app-config.service");
const prisma_service_1 = require("./infrastructure/persistence/prisma.service");
exports.SERVER_LISTEN_HOST = "127.0.0.1";
const ALLOWED_ORIGINS = new Set(["http://127.0.0.1:5173", "http://localhost:5173", "null"]);
function createCorsOptions() {
    return {
        origin(origin, callback) {
            callback(null, origin === undefined || ALLOWED_ORIGINS.has(origin));
        },
        methods: ["GET", "POST", "PUT", "DELETE"],
        allowedHeaders: ["content-type", "x-learning-os-token"],
    };
}
async function bootstrap() {
    const config = new app_config_service_1.AppConfigService();
    await new app_bootstrap_service_1.AppBootstrapService(config.appRootDir).ensureDirectories();
    process.env.DATABASE_URL = config.databaseUrl;
    const app = await core_1.NestFactory.create(app_module_1.AppModule, { cors: createCorsOptions() });
    const prisma = app.get(prisma_service_1.PrismaService);
    await prisma.enableShutdownHooks();
    await app.listen(config.apiPort, exports.SERVER_LISTEN_HOST);
}
if (process.env.VITEST !== "true") {
    void bootstrap();
}

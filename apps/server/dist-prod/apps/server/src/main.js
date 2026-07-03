"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const core_1 = require("@nestjs/core");
const app_bootstrap_service_1 = require("./app/app-bootstrap.service");
const app_module_1 = require("./app/app.module");
const app_config_service_1 = require("./infrastructure/config/app-config.service");
const prisma_service_1 = require("./infrastructure/persistence/prisma.service");
async function bootstrap() {
    const config = new app_config_service_1.AppConfigService();
    await new app_bootstrap_service_1.AppBootstrapService(config.appRootDir).ensureDirectories();
    process.env.DATABASE_URL = config.databaseUrl;
    const app = await core_1.NestFactory.create(app_module_1.AppModule, { cors: true });
    const prisma = app.get(prisma_service_1.PrismaService);
    await prisma.enableShutdownHooks();
    await app.listen(config.apiPort);
}
bootstrap();

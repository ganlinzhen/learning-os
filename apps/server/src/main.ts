import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppBootstrapService } from "./app/app-bootstrap.service";
import { AppModule } from "./app/app.module";
import { AppConfigService } from "./infrastructure/config/app-config.service";
import { PrismaService } from "./infrastructure/persistence/prisma.service";

async function bootstrap() {
  const config = new AppConfigService();
  await new AppBootstrapService(config.appRootDir).ensureDirectories();
  process.env.DATABASE_URL = config.databaseUrl;

  const app = await NestFactory.create(AppModule, { cors: true });
  const prisma = app.get(PrismaService);
  await prisma.enableShutdownHooks();
  await app.listen(config.apiPort);
}

bootstrap();

import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppBootstrapService } from "./app/app-bootstrap.service";
import { AppModule } from "./app/app.module";
import { AppConfigService } from "./infrastructure/config/app-config.service";
import { PrismaService } from "./infrastructure/persistence/prisma.service";

export const SERVER_LISTEN_HOST = "127.0.0.1";
const ALLOWED_ORIGINS = new Set(["http://127.0.0.1:5173", "http://localhost:5173", "null"]);

export function createCorsOptions() {
  return {
    origin(origin: string | undefined, callback: (error: Error | null, allowed?: boolean) => void) {
      callback(null, origin === undefined || ALLOWED_ORIGINS.has(origin));
    },
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["content-type", "x-learning-os-token"],
  };
}

async function bootstrap() {
  const config = new AppConfigService();
  await new AppBootstrapService(config.appRootDir).ensureDirectories();
  process.env.DATABASE_URL = config.databaseUrl;

  const app = await NestFactory.create(AppModule, { cors: createCorsOptions() });
  const prisma = app.get(PrismaService);
  await prisma.enableShutdownHooks();
  await app.listen(config.apiPort, SERVER_LISTEN_HOST);
}

if (process.env.VITEST !== "true") {
  void bootstrap();
}

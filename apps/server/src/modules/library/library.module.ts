import { Module } from "@nestjs/common";
import { AppConfigService } from "../../infrastructure/config/app-config.service";
import { PrismaService } from "../../infrastructure/persistence/prisma.service";
import { LibraryController } from "./library.controller";
import { LibraryService } from "./library.service";

@Module({
  controllers: [LibraryController],
  providers: [AppConfigService, LibraryService, PrismaService],
})
export class LibraryModule {}

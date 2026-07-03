"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LibraryModule = void 0;
const common_1 = require("@nestjs/common");
const app_config_service_1 = require("../../infrastructure/config/app-config.service");
const prisma_service_1 = require("../../infrastructure/persistence/prisma.service");
const library_controller_1 = require("./library.controller");
const library_service_1 = require("./library.service");
let LibraryModule = class LibraryModule {
};
exports.LibraryModule = LibraryModule;
exports.LibraryModule = LibraryModule = __decorate([
    (0, common_1.Module)({
        controllers: [library_controller_1.LibraryController],
        providers: [app_config_service_1.AppConfigService, library_service_1.LibraryService, prisma_service_1.PrismaService],
    })
], LibraryModule);

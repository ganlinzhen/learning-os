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
exports.IngestionController = void 0;
const common_1 = require("@nestjs/common");
const confirm_ingestion_dto_1 = require("./dto/confirm-ingestion.dto");
const create_import_dto_1 = require("./dto/create-import.dto");
const ingestion_service_1 = require("./ingestion.service");
let IngestionController = class IngestionController {
    service;
    constructor(service) {
        this.service = service;
    }
    createImport(input) {
        return this.service.createImport(input);
    }
    getIngestionDetail(sessionId) {
        return this.service.getIngestionDetail(sessionId);
    }
    confirmIngestion(sessionId, input) {
        return this.service.confirmIngestion(sessionId, input);
    }
};
exports.IngestionController = IngestionController;
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_import_dto_1.CreateImportDto]),
    __metadata("design:returntype", void 0)
], IngestionController.prototype, "createImport", null);
__decorate([
    (0, common_1.Get)(":sessionId"),
    __param(0, (0, common_1.Param)("sessionId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], IngestionController.prototype, "getIngestionDetail", null);
__decorate([
    (0, common_1.Post)(":sessionId/confirm"),
    __param(0, (0, common_1.Param)("sessionId")),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, confirm_ingestion_dto_1.ConfirmIngestionDto]),
    __metadata("design:returntype", void 0)
], IngestionController.prototype, "confirmIngestion", null);
exports.IngestionController = IngestionController = __decorate([
    (0, common_1.Controller)("ingestions"),
    __param(0, (0, common_1.Inject)(ingestion_service_1.IngestionService)),
    __metadata("design:paramtypes", [ingestion_service_1.IngestionService])
], IngestionController);

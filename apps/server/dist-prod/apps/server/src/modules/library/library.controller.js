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
exports.LibraryController = void 0;
const common_1 = require("@nestjs/common");
const library_service_1 = require("./library.service");
let LibraryController = class LibraryController {
    service;
    constructor(service) {
        this.service = service;
    }
    listConcepts() {
        return this.service.listConcepts();
    }
    getConceptDetail(conceptId) {
        return this.service.getConceptDetail(conceptId);
    }
};
exports.LibraryController = LibraryController;
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], LibraryController.prototype, "listConcepts", null);
__decorate([
    (0, common_1.Get)(":conceptId"),
    __param(0, (0, common_1.Param)("conceptId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], LibraryController.prototype, "getConceptDetail", null);
exports.LibraryController = LibraryController = __decorate([
    (0, common_1.Controller)("concepts"),
    __param(0, (0, common_1.Inject)(library_service_1.LibraryService)),
    __metadata("design:paramtypes", [library_service_1.LibraryService])
], LibraryController);

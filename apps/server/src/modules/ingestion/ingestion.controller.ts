import { Body, Controller, Get, Inject, Param, Post } from "@nestjs/common";
import { ConfirmIngestionDto } from "./dto/confirm-ingestion.dto";
import { CreateImportDto } from "./dto/create-import.dto";
import { IngestionService } from "./ingestion.service";

@Controller("ingestions")
export class IngestionController {
  constructor(@Inject(IngestionService) private readonly service: IngestionService) {}

  @Post()
  createImport(@Body() input: CreateImportDto) {
    return this.service.createImport(input);
  }

  @Get(":sessionId")
  getIngestionDetail(@Param("sessionId") sessionId: string) {
    return this.service.getIngestionDetail(sessionId);
  }

  @Post(":sessionId/confirm")
  confirmIngestion(@Param("sessionId") sessionId: string, @Body() input: ConfirmIngestionDto) {
    return this.service.confirmIngestion(sessionId, input);
  }
}

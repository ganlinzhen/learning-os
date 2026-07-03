import { Controller, Get, Inject, Param } from "@nestjs/common";
import { LibraryService } from "./library.service";

@Controller("concepts")
export class LibraryController {
  constructor(@Inject(LibraryService) private readonly service: LibraryService) {}

  @Get()
  listConcepts() {
    return this.service.listConcepts();
  }

  @Get(":conceptId")
  getConceptDetail(@Param("conceptId") conceptId: string) {
    return this.service.getConceptDetail(conceptId);
  }
}

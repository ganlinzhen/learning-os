import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../../infrastructure/persistence/prisma.service";

@Injectable()
export class LibraryService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService | any) {}

  async listConcepts() {
    return this.prisma.concept.findMany({
      orderBy: { createdAt: "desc" },
    });
  }

  async getConceptDetail(id: string) {
    return this.prisma.concept.findUnique({
      where: { id },
      include: {
        notes: true,
        reviewCards: true,
      },
    });
  }
}

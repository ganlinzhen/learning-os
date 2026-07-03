import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../../infrastructure/persistence/prisma.service";

@Injectable()
export class SearchService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService | any) {}

  async search(query: string) {
    return this.prisma.concept.findMany({
      where: {
        OR: [{ title: { contains: query } }, { summary: { contains: query } }],
      },
      orderBy: { updatedAt: "desc" },
    });
  }
}

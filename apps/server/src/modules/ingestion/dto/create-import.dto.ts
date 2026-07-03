import type { CreateImportDto as CreateImportInput } from "@learning-os/contracts";

export class CreateImportDto implements CreateImportInput {
  type!: "text" | "url" | "markdown";
  title!: string;
  content!: string;
  url?: string;
}

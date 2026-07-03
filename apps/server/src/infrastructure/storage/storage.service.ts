import { Inject, Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AppConfigService } from "../config/app-config.service";

@Injectable()
export class StorageService {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async saveSourceContent(input: { title: string; content: string; type: string }) {
    const safeName = input.title.trim().replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/^-|-$/g, "") || "untitled";
    const ext = input.type === "markdown" ? "md" : "txt";
    const dir = join(this.config.appRootDir, "sources");
    await mkdir(dir, { recursive: true });
    const localPath = join(dir, `${Date.now()}-${safeName}.${ext}`);
    await writeFile(localPath, input.content, "utf8");
    const contentHash = createHash("sha256").update(input.content).digest("hex");
    return { localPath, contentHash };
  }
}

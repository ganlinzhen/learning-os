import { Inject, Injectable, Optional } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { AppConfigService } from "../config/app-config.service";
import { WebContentError, WebContentService } from "../web/web-content.service";

@Injectable()
export class StorageService {
  private readonly webContentService: WebContentService;

  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Optional() @Inject(WebContentService) webContentService?: WebContentService,
  ) {
    this.webContentService = webContentService ?? new WebContentService();
  }

  async resolveImportContent(input: {
    type: "text" | "url" | "markdown";
    title?: string;
    content?: string;
    url?: string;
  }): Promise<{ title: string; content: string; url?: string }> {
    if (input.type === "url") {
      const url = this.getNonEmptyText(input.url);
      if (!url) {
        throw new WebContentError("web_url_invalid");
      }
      const resolved = await this.webContentService.fetch(url);
      const title = this.requireText(this.getNonEmptyText(input.title) ?? resolved.title, "web_content_empty");
      const content = this.requireText(resolved.content, "web_content_empty");
      return { title, content, url };
    }

    const content = this.requireText(input.content);
    const title = this.requireText(
      this.getNonEmptyText(input.title) ?? (input.type === "markdown" ? this.getMarkdownTitle(content) : undefined),
    );
    return { title, content };
  }

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

  async replaceSourceContent(input: { localPath: string; content: string }) {
    const temporaryPath = join(
      dirname(input.localPath),
      `.${basename(input.localPath)}.${randomUUID()}.tmp`,
    );
    try {
      await writeFile(temporaryPath, input.content, "utf8");
      await rename(temporaryPath, input.localPath);
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined);
      throw error;
    }
    const contentHash = createHash("sha256").update(input.content).digest("hex");
    return { localPath: input.localPath, contentHash };
  }

  async writeNotes(
    inputs: Array<{
      conceptId: string;
      sourceId: string;
      title: string;
      summary: string;
      evidence: string;
      cards: Array<{ question: string; answer: string }>;
    }>,
  ): Promise<Array<{ title: string; content: string; localPath: string }>> {
    const dir = join(this.config.appRootDir, "notes");
    await mkdir(dir, { recursive: true });
    const writtenPaths: string[] = [];
    const notes: Array<{ title: string; content: string; localPath: string }> = [];

    try {
      for (const input of inputs) {
        const localPath = join(dir, `${this.safeFileStem(input.title)}-${input.conceptId}.md`);
        const temporaryPath = join(dir, `.${basename(localPath)}.${randomUUID()}.tmp`);
        const content = this.buildNoteContent(input);
        try {
          await writeFile(temporaryPath, content, "utf8");
          await rename(temporaryPath, localPath);
        } catch (error) {
          await this.removeFiles([temporaryPath]);
          throw error;
        }
        writtenPaths.push(localPath);
        notes.push({ title: input.title, content, localPath });
      }
      return notes;
    } catch (error) {
      await this.removeFiles(writtenPaths);
      throw error;
    }
  }

  async removeFiles(paths: string[]): Promise<void> {
    await Promise.all(
      paths.map(async (path) => {
        try {
          await unlink(path);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
            throw error;
          }
        }
      }),
    );
  }

  private buildNoteContent(input: {
    conceptId: string;
    sourceId: string;
    title: string;
    summary: string;
    evidence: string;
    cards: Array<{ question: string; answer: string }>;
  }): string {
    const cards = input.cards.map((card) => `### ${card.question}\n\n${card.answer}`).join("\n\n");
    return [
      "---",
      `conceptId: ${input.conceptId}`,
      `sourceId: ${input.sourceId}`,
      `createdAt: ${new Date().toISOString()}`,
      "tags: []",
      "---",
      "",
      `# ${input.title}`,
      "",
      "## 摘要",
      "",
      input.summary,
      "",
      "## 核心解释",
      "",
      input.summary,
      "",
      "## 证据",
      "",
      input.evidence,
      "",
      "## 复习卡片",
      "",
      cards,
      "",
    ].join("\n");
  }

  private safeFileStem(title: string): string {
    return title.trim().replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/g, "") || "untitled";
  }

  private getMarkdownTitle(content: string): string | undefined {
    const title = /^\s{0,3}#(?!#)\s+(.+?)\s*$/m.exec(content)?.[1]?.trim();
    return title?.replace(/[ \t]+#+$/, "").trim();
  }

  private getNonEmptyText(value: string | undefined): string | undefined {
    const text = value?.trim();
    return text || undefined;
  }

  private requireText(value: string | undefined, errorCode?: "web_content_empty"): string {
    const text = this.getNonEmptyText(value);
    if (!text) {
      if (errorCode) {
        throw new WebContentError(errorCode);
      }
      throw new Error("导入内容必须提供非空标题和正文");
    }
    return text;
  }
}

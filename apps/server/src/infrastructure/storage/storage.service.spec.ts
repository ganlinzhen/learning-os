import { mkdtempSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { StorageService } from "./storage.service";

describe("StorageService", () => {
  it("原子写入包含完整结构的 Markdown 笔记", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "learning-os-note-write-"));
    const service = new StorageService({ appRootDir: rootDir } as any, { fetch: vi.fn() } as any);

    const [note] = await service.writeNotes([
      {
        conceptId: "concept_1",
        sourceId: "source_1",
        title: "RSC / 入门",
        summary: "服务端组件",
        evidence: "服务端渲染",
        cards: [{ question: "RSC 是什么？", answer: "服务端组件" }],
      },
    ]);

    expect(note.title).toBe("RSC / 入门");
    expect(note.localPath).toBe(join(rootDir, "notes", "RSC-入门-concept_1.md"));
    await expect(readFile(note.localPath, "utf8")).resolves.toBe(note.content);
    expect(note.content).toMatch(
      /^---\nconceptId: concept_1\nsourceId: source_1\ncreatedAt: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\ntags: \[\]\n---/,
    );
    expect(note.content).toContain("# RSC / 入门\n\n## 摘要\n\n服务端组件");
    expect(note.content).toContain("## 核心解释\n\n服务端组件");
    expect(note.content).toContain("## 证据\n\n服务端渲染");
    expect(note.content).toContain("## 复习卡片\n\n### RSC 是什么？\n\n服务端组件");
    const files = await readdir(join(rootDir, "notes"));
    expect(files).toEqual(["RSC-入门-concept_1.md"]);
    expect(files.some((file) => file.endsWith(".tmp"))).toBe(false);
  });

  it("批量写入中途失败时清理已写笔记和临时文件", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "learning-os-note-write-failure-"));
    const notesDir = join(rootDir, "notes");
    await mkdir(join(notesDir, "Broken-concept_2.md"), { recursive: true });
    const service = new StorageService({ appRootDir: rootDir } as any, { fetch: vi.fn() } as any);

    await expect(
      service.writeNotes([
        {
          conceptId: "concept_1",
          sourceId: "source_1",
          title: "First",
          summary: "第一篇",
          evidence: "证据一",
          cards: [],
        },
        {
          conceptId: "concept_2",
          sourceId: "source_1",
          title: "Broken",
          summary: "第二篇",
          evidence: "证据二",
          cards: [],
        },
      ]),
    ).rejects.toBeDefined();

    const files = await readdir(notesDir);
    expect(files).toEqual(["Broken-concept_2.md"]);
    expect(files.some((file) => file.endsWith(".tmp"))).toBe(false);
  });

  it("删除笔记时忽略不存在路径但抛出其他文件错误", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "learning-os-note-remove-"));
    const notesDir = join(rootDir, "notes");
    const existingPath = join(notesDir, "existing.md");
    await mkdir(notesDir, { recursive: true });
    await writeFile(existingPath, "正文", "utf8");
    const service = new StorageService({ appRootDir: rootDir } as any, { fetch: vi.fn() } as any);

    await expect(service.removeFiles([existingPath, join(notesDir, "missing.md")])).resolves.toBeUndefined();
    await expect(readdir(notesDir)).resolves.toEqual([]);
    await expect(service.removeFiles([notesDir])).rejects.toBeDefined();
  });

  it("在原路径原子替换来源正文且不产生第二个来源文件", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "learning-os-source-replace-"));
    const service = new StorageService({ appRootDir: rootDir } as any, { fetch: vi.fn() } as any);
    const stored = await service.saveSourceContent({
      type: "text",
      title: "原始来源",
      content: "原始正文",
    });

    const replaced = await service.replaceSourceContent({
      localPath: stored.localPath,
      content: "解析后的正文",
    });

    expect(replaced).toEqual({
      localPath: stored.localPath,
      contentHash: "8a8bad52eb2e9bffc0ce4041fe9e71de56e5d9bfa16d21e18053b0c60763238d",
    });
    await expect(readFile(stored.localPath, "utf8")).resolves.toBe("解析后的正文");
    await expect(readdir(join(rootDir, "sources"))).resolves.toEqual([basename(stored.localPath)]);
  });

  it("原子替换失败时清理同目录临时文件", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "learning-os-source-replace-failure-"));
    const sourceDir = join(rootDir, "sources");
    const targetDirectory = join(sourceDir, "existing-directory");
    await mkdir(targetDirectory, { recursive: true });
    await writeFile(join(targetDirectory, "keep.txt"), "保留", "utf8");
    const service = new StorageService({ appRootDir: rootDir } as any, { fetch: vi.fn() } as any);

    await expect(
      service.replaceSourceContent({ localPath: targetDirectory, content: "无法替换" }),
    ).rejects.toBeDefined();

    await expect(readdir(sourceDir)).resolves.toEqual(["existing-directory"]);
    await expect(readFile(join(targetDirectory, "keep.txt"), "utf8")).resolves.toBe("保留");
  });

  it("缺少网页地址时返回稳定错误码", async () => {
    const service = new StorageService(
      { appRootDir: "/tmp/learning-os" } as any,
      { fetch: vi.fn() } as any,
    );

    await expect(service.resolveImportContent({ type: "url" })).rejects.toMatchObject({ code: "web_url_invalid" });
  });

  it("从 Markdown 的第一个一级标题推断标题", async () => {
    const service = new StorageService(
      { appRootDir: "/tmp/learning-os" } as any,
      { fetch: vi.fn() } as any,
    );

    await expect(
      service.resolveImportContent({
        type: "markdown",
        content: "# 深度学习\n\n神经网络可以从数据中学习表示。",
      }),
    ).resolves.toEqual({
      title: "深度学习",
      content: "# 深度学习\n\n神经网络可以从数据中学习表示。",
    });
  });

  it("保留 Markdown 一级标题末尾紧邻文本的井号", async () => {
    const service = new StorageService(
      { appRootDir: "/tmp/learning-os" } as any,
      { fetch: vi.fn() } as any,
    );

    await expect(
      service.resolveImportContent({
        type: "markdown",
        content: "# C#\n\n内容",
      }),
    ).resolves.toMatchObject({ title: "C#" });
  });

  it("剔除 Markdown 一级标题前有空格的闭合井号", async () => {
    const service = new StorageService(
      { appRootDir: "/tmp/learning-os" } as any,
      { fetch: vi.fn() } as any,
    );

    await expect(
      service.resolveImportContent({
        type: "markdown",
        content: "# 标题 ###\n\n内容",
      }),
    ).resolves.toMatchObject({ title: "标题" });
  });

  it("忽略 Markdown 空白显式标题并回退一级标题", async () => {
    const service = new StorageService(
      { appRootDir: "/tmp/learning-os" } as any,
      { fetch: vi.fn() } as any,
    );

    await expect(
      service.resolveImportContent({
        type: "markdown",
        title: "   ",
        content: "# 深度学习\n\n神经网络可以从数据中学习表示。",
      }),
    ).resolves.toMatchObject({ title: "深度学习" });
  });

  it("网页导入时优先使用显式标题", async () => {
    const service = new StorageService(
      { appRootDir: "/tmp/learning-os" } as any,
      { fetch: vi.fn() } as any,
    );
    vi.spyOn((service as any).webContentService, "fetch").mockResolvedValue({
      title: "网页标题",
      content: "网页正文",
    });

    await expect(
      service.resolveImportContent({ type: "url", url: "https://example.com", title: "自定义标题" }),
    ).resolves.toEqual({ title: "自定义标题", content: "网页正文", url: "https://example.com" });
  });

  it("忽略 URL 空白显式标题并回退网页标题", async () => {
    const service = new StorageService(
      { appRootDir: "/tmp/learning-os" } as any,
      { fetch: vi.fn() } as any,
    );
    vi.spyOn((service as any).webContentService, "fetch").mockResolvedValue({
      title: "网页标题",
      content: "网页正文",
    });

    await expect(
      service.resolveImportContent({ type: "url", url: "https://example.com", title: "   " }),
    ).resolves.toMatchObject({ title: "网页标题" });
  });
});

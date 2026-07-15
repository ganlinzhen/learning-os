import { mkdtempSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { StorageService } from "./storage.service";

describe("StorageService", () => {
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

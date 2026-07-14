import { describe, expect, it, vi } from "vitest";
import { WebContentService } from "./web-content.service";

describe("WebContentService", () => {
  it("提取网页标题与 article 正文，并清理无关标签", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "text/html; charset=utf-8" },
      text: async () => `
        <html>
          <head><title>网页 &amp; 标题</title></head>
          <body>
            <main>不应被选中</main>
            <article>
              <h1>正文标题</h1>
              <p>第一段 &lt;内容&gt;。</p>
              <script>不应保留</script>
              <p>第二段。</p>
            </article>
          </body>
        </html>`,
    });
    const service = new WebContentService({ fetchImpl: fetchMock as typeof fetch });

    await expect(service.fetch("https://example.com/article")).resolves.toEqual({
      title: "网页 & 标题",
      content: "正文标题\n第一段 <内容>。\n第二段。",
    });
    expect(fetchMock).toHaveBeenCalledWith("https://example.com/article", {
      signal: expect.any(AbortSignal),
    });
  });

  it("在选择标题和正文前忽略脚本与注释中的伪标签", async () => {
    const service = new WebContentService({
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "text/html" },
        text: async () => `
          <html>
            <head>
              <script><title>伪标题</title><article>伪正文</article></script>
              <!-- <title>注释伪标题</title><article>注释伪正文</article> -->
              <title>真实标题</title>
            </head>
            <body><main><p>真实正文</p></main></body>
          </html>`,
      }) as typeof fetch,
    });

    await expect(service.fetch("https://example.com/script-tags")).resolves.toEqual({
      title: "真实标题",
      content: "真实正文",
    });
  });

  it("拒绝 file URL", async () => {
    const service = new WebContentService({ fetchImpl: vi.fn() as typeof fetch });

    await expect(service.fetch("file:///tmp/source.html")).rejects.toMatchObject({ code: "web_url_invalid" });
  });

  it("拒绝非 HTML 响应", async () => {
    const service = new WebContentService({
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "application/pdf" },
      }) as typeof fetch,
    });

    await expect(service.fetch("https://example.com/file.pdf")).rejects.toMatchObject({
      code: "web_content_unsupported",
    });
  });

  it("拒绝缺少标题的网页内容", async () => {
    const service = new WebContentService({
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "text/html" },
        text: async () => "<body><p>正文</p></body>",
      }) as typeof fetch,
    });

    await expect(service.fetch("https://example.com/no-title")).rejects.toMatchObject({ code: "web_content_empty" });
  });

  it("解码常见实体并安全保留越界数值实体", async () => {
    const service = new WebContentService({
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "text/html" },
        text: async () =>
          "<html><head><title>版权 &copy;</title></head><body><p>&ldquo;内容&rdquo; &mdash; &#x110000;</p></body></html>",
      }) as typeof fetch,
    });

    await expect(service.fetch("https://example.com/entities")).resolves.toEqual({
      title: "版权 ©",
      content: "“内容” — &#x110000;",
    });
  });
});

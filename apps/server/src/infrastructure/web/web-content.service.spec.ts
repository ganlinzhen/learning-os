import { describe, expect, it, vi } from "vitest";
import { WebContentService } from "./web-content.service";

const PUBLIC_ADDRESS = [{ address: "93.184.216.34", family: 4 as const }];

function createService(fetchImpl: typeof fetch, dnsLookup = vi.fn().mockResolvedValue(PUBLIC_ADDRESS)) {
  return new WebContentService({ fetchImpl, dnsLookup } as any);
}

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
    const dnsLookup = vi.fn().mockResolvedValue(PUBLIC_ADDRESS);
    const service = createService(fetchMock as typeof fetch, dnsLookup);

    await expect(service.fetch("https://example.com/article")).resolves.toEqual({
      title: "网页 & 标题",
      content: "正文标题\n第一段 <内容>。\n第二段。",
    });
    expect(fetchMock).toHaveBeenCalledWith("https://example.com/article", {
      redirect: "manual",
      signal: expect.any(AbortSignal),
    });
    expect(dnsLookup).toHaveBeenCalledWith("example.com");
  });

  it("在选择标题和正文前忽略脚本与注释中的伪标签", async () => {
    const service = createService(
      vi.fn().mockResolvedValue({
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
    );

    await expect(service.fetch("https://example.com/script-tags")).resolves.toEqual({
      title: "真实标题",
      content: "真实正文",
    });
  });

  it("拒绝 file URL", async () => {
    const service = createService(vi.fn() as typeof fetch);

    await expect(service.fetch("file:///tmp/source.html")).rejects.toMatchObject({ code: "web_url_invalid" });
  });

  it("拒绝非 HTML 响应", async () => {
    const service = createService(
      vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "application/pdf" },
      }) as typeof fetch,
    );

    await expect(service.fetch("https://example.com/file.pdf")).rejects.toMatchObject({
      code: "web_content_unsupported",
    });
  });

  it("拒绝缺少标题的网页内容", async () => {
    const service = createService(
      vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "text/html" },
        text: async () => "<body><p>正文</p></body>",
      }) as typeof fetch,
    );

    await expect(service.fetch("https://example.com/no-title")).rejects.toMatchObject({ code: "web_content_empty" });
  });

  it("解码常见实体并安全保留越界数值实体", async () => {
    const service = createService(
      vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "text/html" },
        text: async () =>
          "<html><head><title>版权 &copy;</title></head><body><p>&ldquo;内容&rdquo; &mdash; &#x110000;</p></body></html>",
      }) as typeof fetch,
    );

    await expect(service.fetch("https://example.com/entities")).resolves.toEqual({
      title: "版权 ©",
      content: "“内容” — &#x110000;",
    });
  });

  it.each([
    "http://127.0.0.1/admin",
    "http://10.0.0.1/admin",
    "http://169.254.169.254/latest/meta-data",
    "http://192.0.2.1/example",
    "http://224.0.0.1/multicast",
    "http://[::1]/admin",
    "http://[fc00::1]/admin",
    "http://[fe80::1]/admin",
    "http://[2001:db8::1]/example",
    "http://[2002:7f00:1::]/embedded-loopback",
  ])("拒绝私网、回环、链路本地和保留地址 %s", async (url) => {
    const fetchMock = vi.fn();
    const dnsLookup = vi.fn();
    const service = createService(fetchMock as typeof fetch, dnsLookup);

    await expect(service.fetch(url)).rejects.toMatchObject({ code: "web_url_invalid" });
    expect(dnsLookup).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("拒绝 DNS 解析到私网的主机", async () => {
    const fetchMock = vi.fn();
    const dnsLookup = vi.fn().mockResolvedValue([{ address: "192.168.1.20", family: 4 }]);
    const service = createService(fetchMock as typeof fetch, dnsLookup);

    await expect(service.fetch("https://notes.example/article")).rejects.toMatchObject({ code: "web_url_invalid" });
    expect(dnsLookup).toHaveBeenCalledWith("notes.example");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("将已校验的 DNS 地址绑定到实际请求", async () => {
    const dnsAddress = { address: "93.184.216.34", family: 4 as const };
    const requestImpl = vi.fn().mockResolvedValue(
      new Response("<html><head><title>标题</title></head><body><p>正文</p></body></html>", {
        headers: { "content-type": "text/html" },
      }),
    );
    const service = new WebContentService({
      dnsLookup: vi.fn().mockResolvedValue([dnsAddress]),
      requestImpl,
    } as any);

    await expect(service.fetch("https://public.example/article")).resolves.toMatchObject({ title: "标题" });
    expect(requestImpl).toHaveBeenCalledWith(
      new URL("https://public.example/article"),
      [dnsAddress],
      expect.any(AbortSignal),
    );
  });

  it("禁止自动重定向并拒绝跳转到私网的地址", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 302,
      headers: { get: (name: string) => (name.toLowerCase() === "location" ? "http://127.0.0.1/admin" : null) },
    });
    const dnsLookup = vi.fn().mockResolvedValue(PUBLIC_ADDRESS);
    const service = createService(fetchMock as typeof fetch, dnsLookup);

    await expect(service.fetch("https://public.example/start")).rejects.toMatchObject({ code: "web_url_invalid" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("https://public.example/start", {
      redirect: "manual",
      signal: expect.any(AbortSignal),
    });
  });

  it("将无效重定向地址转换为稳定抓取错误", async () => {
    const service = createService(
      vi.fn().mockResolvedValue({
        ok: false,
        status: 302,
        headers: { get: (name: string) => (name.toLowerCase() === "location" ? "http://[" : null) },
      }) as typeof fetch,
    );

    await expect(service.fetch("https://public.example/start")).rejects.toMatchObject({ code: "web_fetch_failed" });
  });

  it("限制重定向次数", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => ({
      ok: false,
      status: 302,
      headers: { get: (name: string) => (name.toLowerCase() === "location" ? `${url}/next` : null) },
    }));
    const service = createService(fetchMock as typeof fetch);

    await expect(service.fetch("https://public.example/start")).rejects.toMatchObject({ code: "web_fetch_failed" });
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("拒绝超过响应体字节上限的网页", async () => {
    const service = createService(
      vi.fn().mockResolvedValue(
        new Response("a".repeat(1024 * 1024 + 1), { headers: { "content-type": "text/html" } }),
      ) as typeof fetch,
    );

    await expect(service.fetch("https://public.example/large")).rejects.toMatchObject({ code: "web_fetch_failed" });
  });
});

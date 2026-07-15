import { once } from "node:events";
import { createServer } from "node:http";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebContentService } from "./web-content.service";

const PUBLIC_ADDRESS = [{ address: "93.184.216.34", family: 4 as const }];

function createService(fetchImpl: typeof fetch, dnsLookup = vi.fn().mockResolvedValue(PUBLIC_ADDRESS)) {
  return new WebContentService({ fetchImpl, dnsLookup } as any);
}

describe("WebContentService", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

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
    expect(dnsLookup).toHaveBeenCalledWith("example.com", expect.any(AbortSignal));
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
    expect(dnsLookup).toHaveBeenCalledWith("notes.example", expect.any(AbortSignal));
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

  it("真实 HTTP 请求保留 URL hostname 并固定连接到已校验地址", async () => {
    let receivedHost = "";
    const server = createServer((request, response) => {
      receivedHost = request.headers.host ?? "";
      response.writeHead(200, { "content-type": "text/plain" });
      response.end("ok");
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing_test_server_address");

    try {
      const service = new WebContentService();
      const response = await (service as any).requestPinned(
        new URL(`http://public.example:${address.port}/pinned`),
        [{ address: "127.0.0.1", family: 4 }],
        AbortSignal.timeout(1_000),
      );

      await expect(response.text()).resolves.toBe("ok");
      expect(receivedHost).toBe(`public.example:${address.port}`);
    } finally {
      server.close();
      await once(server, "close");
    }
  });

  it.each([204, 205, 304])("无正文状态 %s 转换为 body 为 null 的 Response", (status) => {
    const incoming = Object.assign(new PassThrough(), {
      headers: {},
      statusCode: status,
      statusMessage: "No Content",
    });
    incoming.end();

    const response = (new WebContentService() as any).toResponse(incoming) as Response;

    expect(response.status).toBe(status);
    expect(response.body).toBeNull();
  });

  it("响应转换异常时拒绝真实请求而不产生未捕获异常", async () => {
    const server = createServer((_request, response) => {
      response.writeHead(700);
      response.end("invalid status");
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing_test_server_address");

    try {
      const service = new WebContentService();
      await expect(
        (service as any).requestPinned(
          new URL(`http://public.example:${address.port}/invalid-status`),
          [{ address: "127.0.0.1", family: 4 }],
          AbortSignal.timeout(1_000),
        ),
      ).rejects.toBeInstanceOf(RangeError);
    } finally {
      server.close();
      await once(server, "close");
    }
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

  it.each([
    ["非成功响应", 500, { "content-type": "text/html" }, "web_fetch_failed"],
    ["非 HTML 响应", 200, { "content-type": "application/pdf" }, "web_content_unsupported"],
    ["缺少 Location 的重定向", 302, {}, "web_fetch_failed"],
    ["重定向到私网", 302, { location: "http://127.0.0.1/admin" }, "web_url_invalid"],
    [
      "Content-Length 超限",
      200,
      { "content-type": "text/html", "content-length": String(1024 * 1024 + 1) },
      "web_fetch_failed",
    ],
  ])("%s 时释放未读取的响应体", async (_name, status, headers, code) => {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ cancel }), { status, headers });
    const service = createService(vi.fn().mockResolvedValue(response) as typeof fetch);

    await expect(service.fetch("https://public.example/start")).rejects.toMatchObject({ code });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("达到重定向上限时释放每一跳的响应体", async () => {
    const cancelMocks: ReturnType<typeof vi.fn>[] = [];
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const cancel = vi.fn();
      cancelMocks.push(cancel);
      return new Response(new ReadableStream({ cancel }), {
        status: 302,
        headers: { location: `${url}/next` },
      });
    });
    const service = createService(fetchMock as typeof fetch);

    await expect(service.fetch("https://public.example/start")).rejects.toMatchObject({ code: "web_fetch_failed" });
    expect(cancelMocks).toHaveLength(6);
    cancelMocks.forEach((cancel) => expect(cancel).toHaveBeenCalledTimes(1));
  });

  it("拒绝超过响应体字节上限的网页", async () => {
    const service = createService(
      vi.fn().mockResolvedValue(
        new Response("a".repeat(1024 * 1024 + 1), { headers: { "content-type": "text/html" } }),
      ) as typeof fetch,
    );

    await expect(service.fetch("https://public.example/large")).rejects.toMatchObject({ code: "web_fetch_failed" });
  });

  it("DNS 查询超过总时限时返回稳定抓取错误", async () => {
    vi.useFakeTimers();
    const service = new WebContentService({ dnsLookup: vi.fn(() => new Promise(() => undefined)) } as any);
    const assertion = expect(service.fetch("https://public.example/start")).rejects.toMatchObject({
      code: "web_fetch_failed",
    });

    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
  });

  it("多跳重定向的 DNS 和请求共享同一个总时限信号", async () => {
    const signals: AbortSignal[] = [];
    const dnsLookup = vi.fn(async (_hostname: string, signal: AbortSignal) => {
      signals.push(signal);
      return PUBLIC_ADDRESS;
    });
    const requestImpl = vi.fn(async (url: URL, _addresses: typeof PUBLIC_ADDRESS, signal: AbortSignal) => {
      signals.push(signal);
      if (url.pathname === "/start") {
        return new Response(null, { status: 302, headers: { location: "/final" } });
      }
      return new Response("<html><head><title>标题</title></head><body><p>正文</p></body></html>", {
        headers: { "content-type": "text/html" },
      });
    });
    const service = new WebContentService({ dnsLookup, requestImpl } as any);

    await expect(service.fetch("https://public.example/start")).resolves.toMatchObject({ title: "标题" });
    expect(new Set(signals).size).toBe(1);
    expect(signals[0]).toBeInstanceOf(AbortSignal);
  });

  it("正文读取超过总时限时取消流并返回稳定抓取错误", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ cancel }), {
      headers: { "content-type": "text/html" },
    });
    const service = createService(vi.fn().mockResolvedValue(response) as typeof fetch);
    const assertion = expect(service.fetch("https://public.example/slow")).rejects.toMatchObject({
      code: "web_fetch_failed",
    });

    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});

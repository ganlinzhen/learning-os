import { Injectable, Optional } from "@nestjs/common";
import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { Readable } from "node:stream";

type DnsAddress = { address: string; family: 4 | 6 };
type DnsLookup = (hostname: string) => Promise<DnsAddress[]>;
type RequestImpl = (url: URL, addresses: DnsAddress[], signal: AbortSignal) => Promise<Response>;

type WebContentServiceOptions = {
  fetchImpl?: typeof fetch;
  dnsLookup?: DnsLookup;
  requestImpl?: RequestImpl;
};

const MAX_REDIRECTS = 5;
const MAX_RESPONSE_BYTES = 1024 * 1024;

type WebContentErrorCode =
  | "web_url_invalid"
  | "web_fetch_failed"
  | "web_content_unsupported"
  | "web_content_empty";

export class WebContentError extends Error {
  constructor(readonly code: WebContentErrorCode) {
    super(code);
  }
}

@Injectable()
export class WebContentService {
  private readonly dnsLookup: DnsLookup;
  private readonly requestImpl: RequestImpl;

  constructor(@Optional() options?: WebContentServiceOptions) {
    this.dnsLookup =
      options?.dnsLookup ??
      (async (hostname) => {
        const addresses = await lookup(hostname, { all: true, verbatim: true });
        return addresses.map(({ address, family }) => ({ address, family: family as 4 | 6 }));
      });
    this.requestImpl = options?.requestImpl ??
      (options?.fetchImpl
        ? (url, _addresses, signal) => options.fetchImpl!(url.toString(), { redirect: "manual", signal })
        : (url, addresses, signal) => this.requestPinned(url, addresses, signal));
  }

  async fetch(url: string): Promise<{ title: string; content: string }> {
    let currentUrl = this.parseSupportedUrl(url);
    let response: Response | undefined;

    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
      const addresses = await this.assertPublicDestination(currentUrl);
      const signal = AbortSignal.timeout(10_000);
      try {
        response = await this.requestImpl(currentUrl, addresses, signal);
      } catch {
        throw new WebContentError("web_fetch_failed");
      }

      if (!this.isRedirect(response.status)) {
        break;
      }
      if (redirectCount === MAX_REDIRECTS) {
        throw new WebContentError("web_fetch_failed");
      }
      const location = response.headers.get("location");
      if (!location) {
        throw new WebContentError("web_fetch_failed");
      }
      try {
        currentUrl = this.parseSupportedUrl(new URL(location, currentUrl).toString());
      } catch (error) {
        if (error instanceof WebContentError) {
          throw error;
        }
        throw new WebContentError("web_fetch_failed");
      }
    }

    if (!response?.ok) {
      throw new WebContentError("web_fetch_failed");
    }
    if (!response.headers.get("content-type")?.toLowerCase().includes("text/html")) {
      throw new WebContentError("web_content_unsupported");
    }

    let html: string;
    try {
      html = await this.readLimitedText(response);
    } catch {
      throw new WebContentError("web_fetch_failed");
    }

    const contentSource = this.removeNonContentHtml(html);
    const title = this.toText(this.getTagContent(contentSource, "title") ?? "");
    const contentHtml =
      this.getTagContent(contentSource, "article") ??
      this.getTagContent(contentSource, "main") ??
      this.getTagContent(contentSource, "body") ??
      "";
    const content = this.toText(contentHtml);

    if (!title || !content) {
      throw new WebContentError("web_content_empty");
    }
    return { title, content };
  }

  private parseSupportedUrl(value: string): URL {
    try {
      const url = new URL(value);
      if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
        throw new WebContentError("web_url_invalid");
      }
      return url;
    } catch {
      throw new WebContentError("web_url_invalid");
    }
  }

  private async assertPublicDestination(url: URL): Promise<DnsAddress[]> {
    const hostname = url.hostname.replace(/^\[|\]$/g, "");
    const literalFamily = isIP(hostname);
    let addresses: DnsAddress[];

    if (literalFamily) {
      addresses = [{ address: hostname, family: literalFamily as 4 | 6 }];
    } else {
      try {
        addresses = await this.dnsLookup(hostname);
      } catch {
        throw new WebContentError("web_fetch_failed");
      }
    }

    if (addresses.length === 0 || addresses.some(({ address }) => !this.isPublicAddress(address))) {
      throw new WebContentError("web_url_invalid");
    }
    return addresses;
  }

  private async requestPinned(url: URL, addresses: DnsAddress[], signal: AbortSignal): Promise<Response> {
    let lastError: unknown;
    for (const address of addresses) {
      try {
        return await this.requestAddress(url, address, signal);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError ?? new Error("request_failed");
  }

  private requestAddress(url: URL, address: DnsAddress, signal: AbortSignal): Promise<Response> {
    return new Promise((resolve, reject) => {
      const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(
        url,
        {
          headers: {
            accept: "text/html,application/xhtml+xml",
            "accept-encoding": "identity",
          },
          lookup: ((_hostname: string, _options: unknown, callback: Function) => {
            callback(null, address.address, address.family);
          }) as any,
          method: "GET",
          signal,
        },
        (incoming) => {
          const headers = new Headers();
          for (const [name, value] of Object.entries(incoming.headers)) {
            if (Array.isArray(value)) {
              value.forEach((item) => headers.append(name, item));
            } else if (value !== undefined) {
              headers.set(name, value);
            }
          }
          resolve(
            new Response(Readable.toWeb(incoming) as ReadableStream<Uint8Array>, {
              headers,
              status: incoming.statusCode ?? 500,
              statusText: incoming.statusMessage,
            }),
          );
        },
      );
      request.once("error", reject);
      request.end();
    });
  }

  private isPublicAddress(address: string): boolean {
    const family = isIP(address);
    if (family === 4) {
      const value = this.ipv4ToNumber(address);
      return ![
        ["0.0.0.0", 8],
        ["10.0.0.0", 8],
        ["100.64.0.0", 10],
        ["127.0.0.0", 8],
        ["169.254.0.0", 16],
        ["172.16.0.0", 12],
        ["192.0.0.0", 24],
        ["192.0.2.0", 24],
        ["192.88.99.0", 24],
        ["192.168.0.0", 16],
        ["198.18.0.0", 15],
        ["198.51.100.0", 24],
        ["203.0.113.0", 24],
        ["224.0.0.0", 4],
        ["240.0.0.0", 4],
      ].some(([network, prefix]) => this.isIpv4InCidr(value, this.ipv4ToNumber(String(network)), Number(prefix)));
    }
    if (family !== 6 || address.includes("%")) {
      return false;
    }
    const value = this.ipv6ToBigInt(address);
    if (value === undefined || value >> 125n !== 1n) {
      return false;
    }
    return ![
      ["2001::", 32],
      ["2001:2::", 48],
      ["2001:10::", 28],
      ["2001:20::", 28],
      ["2001:db8::", 32],
      ["2002::", 16],
      ["3fff::", 20],
    ].some(([network, prefix]) => this.isIpv6InCidr(value, this.ipv6ToBigInt(String(network))!, Number(prefix)));
  }

  private ipv4ToNumber(address: string): number {
    return address.split(".").reduce((value, part) => ((value << 8) | Number(part)) >>> 0, 0);
  }

  private isIpv4InCidr(value: number, network: number, prefix: number): boolean {
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    return (value & mask) >>> 0 === (network & mask) >>> 0;
  }

  private ipv6ToBigInt(address: string): bigint | undefined {
    let normalized = address.toLowerCase();
    const ipv4Match = /(?:^|:)(\d+\.\d+\.\d+\.\d+)$/.exec(normalized);
    if (ipv4Match) {
      const ipv4 = this.ipv4ToNumber(ipv4Match[1]);
      normalized = `${normalized.slice(0, ipv4Match.index + 1)}${(ipv4 >>> 16).toString(16)}:${(ipv4 & 0xffff).toString(16)}`;
    }
    const halves = normalized.split("::");
    if (halves.length > 2) return undefined;
    const left = halves[0] ? halves[0].split(":") : [];
    const right = halves[1] ? halves[1].split(":") : [];
    const missing = 8 - left.length - right.length;
    if ((halves.length === 1 && missing !== 0) || missing < 0) return undefined;
    const parts = [...left, ...Array.from({ length: missing }, () => "0"), ...right];
    if (parts.length !== 8 || parts.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return undefined;
    return parts.reduce((value, part) => (value << 16n) | BigInt(`0x${part}`), 0n);
  }

  private isIpv6InCidr(value: bigint, network: bigint, prefix: number): boolean {
    const shift = BigInt(128 - prefix);
    return value >> shift === network >> shift;
  }

  private isRedirect(status: number): boolean {
    return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
  }

  private async readLimitedText(response: Response): Promise<string> {
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
      throw new WebContentError("web_fetch_failed");
    }
    if (!response.body) {
      const text = await response.text();
      if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
        throw new WebContentError("web_fetch_failed");
      }
      return text;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let receivedBytes = 0;
    let text = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      receivedBytes += value.byteLength;
      if (receivedBytes > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new WebContentError("web_fetch_failed");
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  }

  private getTagContent(html: string, tagName: string): string | undefined {
    const match = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)</${tagName}\\s*>`, "i").exec(html);
    return match?.[1];
  }

  private removeNonContentHtml(html: string): string {
    return html
      .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
      .replace(/<!--[\s\S]*?-->/g, "");
  }

  private toText(html: string): string {
    const withoutNonContent = this.removeNonContentHtml(html);
    const withBlockLines = withoutNonContent
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<\/?(address|article|aside|blockquote|body|div|dl|dt|dd|fieldset|figcaption|figure|footer|form|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|tbody|td|tfoot|th|thead|tr|ul)\b[^>]*>/gi, "\n");
    const decoded = this.decodeEntities(withBlockLines.replace(/<[^>]+>/g, ""));

    return decoded
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join("\n");
  }

  private decodeEntities(value: string): string {
    const namedEntities: Record<string, string> = {
      amp: "&",
      apos: "'",
      copy: "©",
      deg: "°",
      hellip: "…",
      ldquo: "“",
      lsquo: "‘",
      mdash: "—",
      ndash: "–",
      gt: ">",
      lt: "<",
      nbsp: " ",
      quot: '"',
      rdquo: "”",
      reg: "®",
      rsquo: "’",
      trade: "™",
    };
    return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, rawEntity: string) => {
      const entityName = rawEntity.toLowerCase();
      if (entityName.startsWith("#x")) {
        return this.decodeCodePoint(entity, Number.parseInt(entityName.slice(2), 16));
      }
      if (entityName.startsWith("#")) {
        return this.decodeCodePoint(entity, Number.parseInt(entityName.slice(1), 10));
      }
      return namedEntities[entityName] ?? entity;
    });
  }

  private decodeCodePoint(originalEntity: string, codePoint: number): string {
    if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
      return originalEntity;
    }
    return String.fromCodePoint(codePoint);
  }
}

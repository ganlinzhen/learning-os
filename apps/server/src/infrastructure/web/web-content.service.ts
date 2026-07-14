import { Injectable, Optional } from "@nestjs/common";

type WebContentServiceOptions = {
  fetchImpl?: typeof fetch;
};

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
  private readonly fetchImpl: typeof fetch;

  constructor(@Optional() options?: WebContentServiceOptions) {
    this.fetchImpl = options?.fetchImpl ?? fetch;
  }

  async fetch(url: string): Promise<{ title: string; content: string }> {
    if (!this.isSupportedUrl(url)) {
      throw new WebContentError("web_url_invalid");
    }

    let response: Response;
    try {
      response = await this.fetchImpl(url, { signal: AbortSignal.timeout(10_000) });
    } catch {
      throw new WebContentError("web_fetch_failed");
    }

    if (!response.ok) {
      throw new WebContentError("web_fetch_failed");
    }
    if (!response.headers.get("content-type")?.toLowerCase().includes("text/html")) {
      throw new WebContentError("web_content_unsupported");
    }

    let html: string;
    try {
      html = await response.text();
    } catch {
      throw new WebContentError("web_fetch_failed");
    }

    const title = this.toText(this.getTagContent(html, "title") ?? "");
    const contentHtml =
      this.getTagContent(html, "article") ?? this.getTagContent(html, "main") ?? this.getTagContent(html, "body") ?? "";
    const content = this.toText(contentHtml);

    if (!title || !content) {
      throw new WebContentError("web_content_empty");
    }
    return { title, content };
  }

  private isSupportedUrl(value: string): boolean {
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  }

  private getTagContent(html: string, tagName: string): string | undefined {
    const match = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)</${tagName}\\s*>`, "i").exec(html);
    return match?.[1];
  }

  private toText(html: string): string {
    const withoutNonContent = html.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
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

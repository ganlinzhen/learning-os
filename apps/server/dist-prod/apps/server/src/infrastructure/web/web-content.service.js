"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebContentService = exports.WebContentError = void 0;
const common_1 = require("@nestjs/common");
const promises_1 = require("node:dns/promises");
const node_http_1 = require("node:http");
const node_https_1 = require("node:https");
const node_net_1 = require("node:net");
const node_stream_1 = require("node:stream");
const MAX_REDIRECTS = 5;
const MAX_RESPONSE_BYTES = 1024 * 1024;
class WebContentError extends Error {
    code;
    constructor(code) {
        super(code);
        this.code = code;
    }
}
exports.WebContentError = WebContentError;
let WebContentService = class WebContentService {
    dnsLookup;
    requestImpl;
    constructor(options) {
        this.dnsLookup =
            options?.dnsLookup ??
                (async (hostname) => {
                    const addresses = await (0, promises_1.lookup)(hostname, { all: true, verbatim: true });
                    return addresses.map(({ address, family }) => ({ address, family: family }));
                });
        this.requestImpl = options?.requestImpl ??
            (options?.fetchImpl
                ? (url, _addresses, signal) => options.fetchImpl(url.toString(), { redirect: "manual", signal })
                : (url, addresses, signal) => this.requestPinned(url, addresses, signal));
    }
    async fetch(url) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(new Error("request_timeout")), 10_000);
        timeout.unref?.();
        try {
            return await this.fetchWithSignal(url, controller.signal);
        }
        finally {
            clearTimeout(timeout);
        }
    }
    async fetchWithSignal(url, signal) {
        let currentUrl = this.parseSupportedUrl(url);
        let response;
        for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
            const addresses = await this.assertPublicDestination(currentUrl, signal);
            try {
                response = await this.withAbort(this.requestImpl(currentUrl, addresses, signal), signal);
            }
            catch {
                throw new WebContentError("web_fetch_failed");
            }
            if (!this.isRedirect(response.status)) {
                break;
            }
            await this.discardResponse(response, signal);
            if (redirectCount === MAX_REDIRECTS) {
                throw new WebContentError("web_fetch_failed");
            }
            const location = response.headers.get("location");
            if (!location) {
                throw new WebContentError("web_fetch_failed");
            }
            try {
                currentUrl = this.parseSupportedUrl(new URL(location, currentUrl).toString());
            }
            catch (error) {
                if (error instanceof WebContentError) {
                    throw error;
                }
                throw new WebContentError("web_fetch_failed");
            }
        }
        if (!response?.ok) {
            if (response)
                await this.discardResponse(response, signal);
            throw new WebContentError("web_fetch_failed");
        }
        if (!response.headers.get("content-type")?.toLowerCase().includes("text/html")) {
            await this.discardResponse(response, signal);
            throw new WebContentError("web_content_unsupported");
        }
        let html;
        try {
            html = await this.readLimitedText(response, signal);
        }
        catch {
            throw new WebContentError("web_fetch_failed");
        }
        const contentSource = this.removeNonContentHtml(html);
        const title = this.toText(this.getTagContent(contentSource, "title") ?? "");
        const contentHtml = this.getTagContent(contentSource, "article") ??
            this.getTagContent(contentSource, "main") ??
            this.getTagContent(contentSource, "body") ??
            "";
        const content = this.toText(contentHtml);
        if (!title || !content) {
            throw new WebContentError("web_content_empty");
        }
        return { title, content };
    }
    parseSupportedUrl(value) {
        try {
            const url = new URL(value);
            if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
                throw new WebContentError("web_url_invalid");
            }
            return url;
        }
        catch {
            throw new WebContentError("web_url_invalid");
        }
    }
    async assertPublicDestination(url, signal) {
        const hostname = url.hostname.replace(/^\[|\]$/g, "");
        const literalFamily = (0, node_net_1.isIP)(hostname);
        let addresses;
        if (literalFamily) {
            addresses = [{ address: hostname, family: literalFamily }];
        }
        else {
            try {
                addresses = await this.withAbort(this.dnsLookup(hostname, signal), signal);
            }
            catch {
                throw new WebContentError("web_fetch_failed");
            }
        }
        if (addresses.length === 0 || addresses.some(({ address }) => !this.isPublicAddress(address))) {
            throw new WebContentError("web_url_invalid");
        }
        return addresses;
    }
    async requestPinned(url, addresses, signal) {
        let lastError;
        for (const address of addresses) {
            try {
                return await this.requestAddress(url, address, signal);
            }
            catch (error) {
                lastError = error;
            }
        }
        throw lastError ?? new Error("request_failed");
    }
    requestAddress(url, address, signal) {
        return new Promise((resolve, reject) => {
            const hostname = url.hostname.replace(/^\[|\]$/g, "");
            const requestOptions = {
                autoSelectFamily: false,
                family: address.family,
                headers: {
                    accept: "text/html,application/xhtml+xml",
                    "accept-encoding": "identity",
                },
                lookup: ((_hostname, options, callback) => {
                    if (options.all) {
                        callback(null, [address]);
                        return;
                    }
                    callback(null, address.address, address.family);
                }),
                method: "GET",
                servername: url.protocol === "https:" && !(0, node_net_1.isIP)(hostname) ? hostname : undefined,
                signal,
            };
            const request = (url.protocol === "https:" ? node_https_1.request : node_http_1.request)(url, requestOptions, (incoming) => {
                try {
                    resolve(this.toResponse(incoming));
                }
                catch (error) {
                    incoming.destroy();
                    reject(error);
                }
            });
            request.once("error", reject);
            request.end();
        });
    }
    toResponse(incoming) {
        const headers = new Headers();
        for (const [name, value] of Object.entries(incoming.headers)) {
            if (Array.isArray(value)) {
                value.forEach((item) => headers.append(name, item));
            }
            else if (value !== undefined) {
                headers.set(name, value);
            }
        }
        const status = incoming.statusCode ?? 500;
        const hasNoBody = status === 204 || status === 205 || status === 304;
        if (hasNoBody) {
            incoming.resume();
        }
        return new Response(hasNoBody ? null : node_stream_1.Readable.toWeb(incoming), {
            headers,
            status,
            statusText: incoming.statusMessage,
        });
    }
    async discardResponse(response, signal) {
        if (!response.body)
            return;
        try {
            await this.withAbort(response.body.cancel(), signal);
        }
        catch {
            // 释放失败不覆盖原始业务错误。
        }
    }
    withAbort(operation, signal) {
        return new Promise((resolve, reject) => {
            const onAbort = () => reject(signal.reason ?? new Error("request_timeout"));
            if (signal.aborted) {
                operation.catch(() => undefined);
                onAbort();
                return;
            }
            signal.addEventListener("abort", onAbort, { once: true });
            operation.then((value) => {
                signal.removeEventListener("abort", onAbort);
                resolve(value);
            }, (error) => {
                signal.removeEventListener("abort", onAbort);
                reject(error);
            });
        });
    }
    isPublicAddress(address) {
        const family = (0, node_net_1.isIP)(address);
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
        ].some(([network, prefix]) => this.isIpv6InCidr(value, this.ipv6ToBigInt(String(network)), Number(prefix)));
    }
    ipv4ToNumber(address) {
        return address.split(".").reduce((value, part) => ((value << 8) | Number(part)) >>> 0, 0);
    }
    isIpv4InCidr(value, network, prefix) {
        const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
        return (value & mask) >>> 0 === (network & mask) >>> 0;
    }
    ipv6ToBigInt(address) {
        let normalized = address.toLowerCase();
        const ipv4Match = /(?:^|:)(\d+\.\d+\.\d+\.\d+)$/.exec(normalized);
        if (ipv4Match) {
            const ipv4 = this.ipv4ToNumber(ipv4Match[1]);
            normalized = `${normalized.slice(0, ipv4Match.index + 1)}${(ipv4 >>> 16).toString(16)}:${(ipv4 & 0xffff).toString(16)}`;
        }
        const halves = normalized.split("::");
        if (halves.length > 2)
            return undefined;
        const left = halves[0] ? halves[0].split(":") : [];
        const right = halves[1] ? halves[1].split(":") : [];
        const missing = 8 - left.length - right.length;
        if ((halves.length === 1 && missing !== 0) || missing < 0)
            return undefined;
        const parts = [...left, ...Array.from({ length: missing }, () => "0"), ...right];
        if (parts.length !== 8 || parts.some((part) => !/^[0-9a-f]{1,4}$/.test(part)))
            return undefined;
        return parts.reduce((value, part) => (value << 16n) | BigInt(`0x${part}`), 0n);
    }
    isIpv6InCidr(value, network, prefix) {
        const shift = BigInt(128 - prefix);
        return value >> shift === network >> shift;
    }
    isRedirect(status) {
        return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
    }
    async readLimitedText(response, signal) {
        const declaredLength = Number(response.headers.get("content-length"));
        if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
            await this.discardResponse(response, signal);
            throw new WebContentError("web_fetch_failed");
        }
        if (!response.body) {
            const text = await this.withAbort(response.text(), signal);
            if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
                throw new WebContentError("web_fetch_failed");
            }
            return text;
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let receivedBytes = 0;
        let text = "";
        try {
            while (true) {
                const { done, value } = await this.withAbort(reader.read(), signal);
                if (done)
                    break;
                receivedBytes += value.byteLength;
                if (receivedBytes > MAX_RESPONSE_BYTES) {
                    await this.withAbort(reader.cancel(), signal).catch(() => undefined);
                    throw new WebContentError("web_fetch_failed");
                }
                text += decoder.decode(value, { stream: true });
            }
        }
        catch (error) {
            await this.withAbort(reader.cancel(), signal).catch(() => undefined);
            throw error;
        }
        return text + decoder.decode();
    }
    getTagContent(html, tagName) {
        const match = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)</${tagName}\\s*>`, "i").exec(html);
        return match?.[1];
    }
    removeNonContentHtml(html) {
        return html
            .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
            .replace(/<!--[\s\S]*?-->/g, "");
    }
    toText(html) {
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
    decodeEntities(value) {
        const namedEntities = {
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
        return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, rawEntity) => {
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
    decodeCodePoint(originalEntity, codePoint) {
        if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
            return originalEntity;
        }
        return String.fromCodePoint(codePoint);
    }
};
exports.WebContentService = WebContentService;
exports.WebContentService = WebContentService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [Object])
], WebContentService);

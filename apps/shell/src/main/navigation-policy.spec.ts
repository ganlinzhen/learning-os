import { describe, expect, it } from "vitest";
import { isTrustedRendererUrl } from "./navigation-policy.js";

const developmentAppUrl = "http://127.0.0.1:5173";
const packagedAppUrl = "file:///Applications/Learning%20OS.app/Contents/Resources/app/console/index.html";

describe("桌面渲染页面信任边界", () => {
  it.each([
    "http://127.0.0.1:5173/settings",
    "file:///Applications/Learning%20OS.app/Contents/Resources/app/console/index.html",
  ])("允许应用页面请求受控 IPC：%s", (url) => {
    expect(isTrustedRendererUrl(url, url.startsWith("file:") ? packagedAppUrl : developmentAppUrl)).toBe(true);
  });

  it.each([
    "https://attacker.example",
    "http://127.0.0.1:5174",
    "data:text/html,attacker",
  ])("拒绝非应用页面请求受控 IPC：%s", (url) => {
    expect(isTrustedRendererUrl(url, developmentAppUrl)).toBe(false);
  });

  it("拒绝导航到另一个本地文件", () => {
    expect(isTrustedRendererUrl("file:///tmp/attacker.html", packagedAppUrl)).toBe(false);
  });
});

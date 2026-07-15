import { describe, expect, it } from "vitest";
import { createCorsOptions, SERVER_LISTEN_HOST } from "./main";

describe("Server 启动安全配置", () => {
  it("只监听本机回环地址", () => {
    expect(SERVER_LISTEN_HOST).toBe("127.0.0.1");
  });

  it("仅允许 Vite 与 Electron 的受控来源", async () => {
    const origin = createCorsOptions().origin as (origin: string | undefined, callback: (error: Error | null, allowed?: boolean) => void) => void;
    const check = (value: string | undefined) => new Promise<boolean>((resolve) => origin(value, (_error, allowed) => resolve(Boolean(allowed))));

    await expect(check("http://127.0.0.1:5173")).resolves.toBe(true);
    await expect(check("null")).resolves.toBe(true);
    await expect(check("https://attacker.example")).resolves.toBe(false);
  });
});

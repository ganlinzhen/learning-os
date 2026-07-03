import { describe, expect, it } from "vitest";
import { resolveRuntimePaths } from "./runtime-paths.js";

describe("resolveRuntimePaths", () => {
  it("在开发态返回 Vite 地址与源码服务入口", () => {
    const paths = resolveRuntimePaths({
      isPackaged: false,
      appPath: "/tmp/Learning OS.app",
      userDataPath: "/tmp/user-data",
    });

    expect(paths.webUrl).toBe("http://127.0.0.1:5173");
    expect(paths.serverCommand.command).toBe("node");
    expect(paths.serverCommand.args).toContain("apps/server/dist-prod/apps/server/src/main.js");
    expect(paths.generatorCommand.command).toBe("python3.11");
  });

  it("在生产态返回打包后的资源路径", () => {
    const paths = resolveRuntimePaths({
      isPackaged: true,
      appPath: "/Applications/Learning OS.app/Contents/Resources/app.asar",
      userDataPath: "/Users/demo/Library/Application Support/Learning OS",
    });

    expect(paths.webUrl.startsWith("file://")).toBe(true);
    expect(paths.serverCommand.args.at(-1)).toBe(
      "/Applications/Learning OS.app/Contents/Resources/server/dist-prod/apps/server/src/main.js",
    );
    expect(paths.generatorCommand.command).toBe(
      "/Applications/Learning OS.app/Contents/Resources/generator/learning-os-generator",
    );
  });
});

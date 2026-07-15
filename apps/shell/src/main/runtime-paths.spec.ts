import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveRuntimePaths } from "./runtime-paths.js";

describe("resolveRuntimePaths", () => {
  it("在开发态返回 Vite 地址与源码服务入口", () => {
    const paths = resolveRuntimePaths({
      isPackaged: false,
      appPath: "/tmp/Learning OS.app",
      userDataPath: "/tmp/user-data",
      apiToken: "runtime-token",
    });

    expect(paths.webUrl).toBe("http://127.0.0.1:5173");
    expect(paths.serverCommand.command).toBe("node");
    expect(paths.serverCommand.args).toContain("apps/server/dist-prod/apps/server/src/main.js");
    expect(paths.serverCommand.env.LEARNING_OS_LLM_CONFIG_PATH).toBe(
      "/tmp/user-data/runtime/settings/llm.json",
    );
    expect(paths.serverCommand.env.LEARNING_OS_API_TOKEN).toBe("runtime-token");
    expect(paths.generatorCommand.env.LEARNING_OS_LLM_CONFIG_PATH).toBe(
      paths.serverCommand.env.LEARNING_OS_LLM_CONFIG_PATH,
    );
    expect(paths.generatorCommand.command).toBe("python3.11");
  });

  it("根目录开发脚本将 LLM 配置路径传递给子进程", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "../..", "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const turboJson = JSON.parse(readFileSync(join(process.cwd(), "../..", "turbo.json"), "utf8")) as {
      tasks: Record<string, { passThroughEnv?: string[] }>;
    };
    const envPrefix = 'LEARNING_OS_LLM_CONFIG_PATH="${PWD}/.learning-os/settings/llm.json" LEARNING_OS_API_TOKEN=learning-os-development VITE_LEARNING_OS_API_TOKEN=learning-os-development';

    expect(packageJson.scripts["dev:web"]).toBe(
      `${envPrefix} turbo run dev:console dev:server dev:generator`,
    );
    expect(packageJson.scripts["dev:desktop"]).toBe(
      `${envPrefix} turbo run dev:console dev:server dev:generator dev:shell`,
    );
    expect(packageJson.scripts["dev:server"]).toBe(
      'LEARNING_OS_LLM_CONFIG_PATH="${PWD}/.learning-os/settings/llm.json" LEARNING_OS_API_TOKEN=learning-os-development turbo run dev:server --filter=@learning-os/server',
    );
    expect(packageJson.scripts["dev:generator"]).toBe(
      'LEARNING_OS_LLM_CONFIG_PATH="${PWD}/.learning-os/settings/llm.json"; export LEARNING_OS_LLM_CONFIG_PATH; cd apps/generator && ../../.venv/bin/python -m uvicorn learning_os_generator.api.app:app --app-dir src --host 127.0.0.1 --port 8000',
    );
    expect(turboJson.tasks["dev:server"].passThroughEnv).toEqual(["LEARNING_OS_LLM_CONFIG_PATH", "LEARNING_OS_API_TOKEN"]);
    expect(turboJson.tasks["//#dev:generator"].passThroughEnv).toEqual([
      "LEARNING_OS_LLM_CONFIG_PATH",
    ]);
    expect(
      Object.values(turboJson.tasks).flatMap((task) => task.passThroughEnv ?? []),
    ).toEqual(["VITE_LEARNING_OS_API_TOKEN", "LEARNING_OS_LLM_CONFIG_PATH", "LEARNING_OS_API_TOKEN", "LEARNING_OS_LLM_CONFIG_PATH"]);
  });

  it("在生产态返回打包后的资源路径", () => {
    const paths = resolveRuntimePaths({
      isPackaged: true,
      appPath: "/Applications/Learning OS.app/Contents/Resources/app.asar",
      userDataPath: "/Users/demo/Library/Application Support/Learning OS",
      apiToken: "runtime-token",
    });

    expect(paths.webUrl.startsWith("file://")).toBe(true);
    expect(paths.serverCommand.args.at(-1)).toBe(
      "/Applications/Learning OS.app/Contents/Resources/server/dist-prod/apps/server/src/main.js",
    );
    expect(paths.generatorCommand.command).toBe(
      "/Applications/Learning OS.app/Contents/Resources/generator/learning-os-generator",
    );
    expect(paths.serverCommand.env.LEARNING_OS_LLM_CONFIG_PATH).toBe(
      "/Users/demo/Library/Application Support/Learning OS/runtime/settings/llm.json",
    );
    expect(paths.serverCommand.env.LEARNING_OS_API_TOKEN).toBe("runtime-token");
    expect(paths.generatorCommand.env.LEARNING_OS_LLM_CONFIG_PATH).toBe(
      paths.serverCommand.env.LEARNING_OS_LLM_CONFIG_PATH,
    );
  });
});

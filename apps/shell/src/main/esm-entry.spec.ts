import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const currentDir = dirname(fileURLToPath(import.meta.url));
const shellRootDir = resolve(currentDir, "../..");

it("构建后的主进程入口可以被 Node 以 ESM 方式导入", () => {
  execFileSync("pnpm", ["build"], {
    cwd: shellRootDir,
    stdio: "pipe",
  });

  const mainEntry = readFileSync(resolve(shellRootDir, "dist/main/main.js"), "utf8");

  expect(mainEntry).toContain('from "./runtime-paths.js"');
  expect(mainEntry).toContain('from "./service-supervisor.js"');
  expect(mainEntry).toContain('join(currentDir, "..", "preload", "preload.cjs")');
  expect(() => readFileSync(resolve(shellRootDir, "dist/preload/preload.cjs"), "utf8")).not.toThrow();
});

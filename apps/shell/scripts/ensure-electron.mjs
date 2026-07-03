import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const electronPackageJson = require.resolve("electron/package.json");
const electronDir = dirname(electronPackageJson);
const installScript = join(electronDir, "install.js");
const pathFile = join(electronDir, "path.txt");

function hasElectronBinary() {
  if (!existsSync(pathFile)) {
    return false;
  }

  const executablePath = readFileSync(pathFile, "utf8").trim();
  if (!executablePath) {
    return false;
  }

  return existsSync(join(electronDir, "dist", executablePath));
}

if (hasElectronBinary()) {
  process.exit(0);
}

console.warn("[desktop] 检测到 Electron 二进制缺失，正在尝试重新安装...");

const result = spawnSync(process.execPath, [installScript], {
  stdio: "inherit",
});

if (result.status === 0 && hasElectronBinary()) {
  console.warn("[desktop] Electron 二进制补装完成。");
  process.exit(0);
}

console.error("[desktop] Electron 仍未安装完整。");
console.error("[desktop] 请确认网络可访问 GitHub 资源后执行 `pnpm rebuild electron`，再重新启动桌面端。");
process.exit(result.status ?? 1);

import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserWindow, app } from "electron";
import { resolveRuntimePaths } from "./runtime-paths.js";
import { ServiceSupervisor } from "./service-supervisor.js";

const currentDir = dirname(fileURLToPath(import.meta.url));
const preloadPath = join(currentDir, "..", "preload", "preload.cjs");
const supervisor = new ServiceSupervisor(spawn);

function createMainWindow(webUrl: string) {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 760,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      preload: preloadPath,
    },
  });

  void window.loadURL(webUrl);
}

async function main() {
  await app.whenReady();
  const paths = resolveRuntimePaths({
    isPackaged: app.isPackaged,
    appPath: app.getAppPath(),
    userDataPath: app.getPath("userData"),
  });

  if (app.isPackaged) {
    await supervisor.start({
      generator: paths.generatorCommand,
      server: paths.serverCommand,
      healthChecks: ["http://127.0.0.1:8000/docs", "http://127.0.0.1:3000/health"],
    });
  }

  createMainWindow(process.env.LEARNING_OS_WEB_URL ?? paths.webUrl);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow(process.env.LEARNING_OS_WEB_URL ?? paths.webUrl);
    }
  });

  app.on("window-all-closed", () => {
    supervisor.stop();
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  app.on("before-quit", () => {
    supervisor.stop();
  });
}

void main();

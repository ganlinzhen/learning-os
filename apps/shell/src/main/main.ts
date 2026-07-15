import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserWindow, app, ipcMain } from "electron";
import { resolveRuntimePaths } from "./runtime-paths.js";
import { ServiceSupervisor } from "./service-supervisor.js";

const currentDir = dirname(fileURLToPath(import.meta.url));
const preloadPath = join(currentDir, "..", "preload", "preload.cjs");
const supervisor = new ServiceSupervisor(spawn);

function createMainWindow(webUrl: string, apiToken: string) {
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

  ipcMain.removeHandler("learning-os:get-api-token");
  ipcMain.handle("learning-os:get-api-token", (event) => {
    if (event.sender.id !== window.webContents.id) {
      throw new Error("未授权的桌面令牌请求");
    }
    return apiToken;
  });

  void window.loadURL(webUrl);
}

async function main() {
  await app.whenReady();
  const apiToken = app.isPackaged
    ? randomBytes(32).toString("base64url")
    : (process.env.LEARNING_OS_API_TOKEN ?? "learning-os-development");
  const paths = resolveRuntimePaths({
    isPackaged: app.isPackaged,
    appPath: app.getAppPath(),
    userDataPath: app.getPath("userData"),
    apiToken,
  });

  if (app.isPackaged) {
    await supervisor.start({
      generator: paths.generatorCommand,
      server: paths.serverCommand,
      healthChecks: ["http://127.0.0.1:8000/docs", "http://127.0.0.1:3000/health"],
    });
  }

  createMainWindow(process.env.LEARNING_OS_WEB_URL ?? paths.webUrl, apiToken);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow(process.env.LEARNING_OS_WEB_URL ?? paths.webUrl, apiToken);
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

import { join } from "node:path";
import { pathToFileURL } from "node:url";

export type RuntimeCommand = {
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
};

export type RuntimePaths = {
  webUrl: string;
  dataRootDir: string;
  logDir: string;
  serverCommand: RuntimeCommand;
  generatorCommand: RuntimeCommand;
};

type ResolveRuntimePathsInput = {
  isPackaged: boolean;
  appPath: string;
  userDataPath: string;
};

export function resolveRuntimePaths(input: ResolveRuntimePathsInput): RuntimePaths {
  const dataRootDir = join(input.userDataPath, "runtime");
  const logDir = join(input.userDataPath, "logs");

  if (!input.isPackaged) {
    return {
      webUrl: "http://127.0.0.1:5173",
      dataRootDir,
      logDir,
      serverCommand: {
        command: "node",
        args: ["apps/server/dist-prod/apps/server/src/main.js"],
        cwd: process.cwd(),
        env: {},
      },
      generatorCommand: {
        command: "python3.11",
        args: [
          "-m",
          "uvicorn",
          "learning_os_generator.api.app:app",
          "--app-dir",
          "apps/generator/src",
          "--host",
          "127.0.0.1",
          "--port",
          "8000",
        ],
        cwd: process.cwd(),
        env: {},
      },
    };
  }

  const resourcesDir = join(input.appPath, "..");

  return {
    webUrl: pathToFileURL(join(resourcesDir, "app", "console", "index.html")).toString(),
    dataRootDir,
    logDir,
    serverCommand: {
      command: "node",
      args: [join(resourcesDir, "server", "dist-prod", "apps", "server", "src", "main.js")],
      cwd: join(resourcesDir, "server", "dist-prod"),
      env: {},
    },
    generatorCommand: {
      command: join(resourcesDir, "generator", "learning-os-generator"),
      args: [],
      cwd: join(resourcesDir, "generator"),
      env: {},
    },
  };
}

import type { ChildProcess } from "node:child_process";

export class ProcessManager {
  private readonly processes: ChildProcess[] = [];

  constructor(
    private readonly spawnImpl: any,
    private readonly shouldManageServices: boolean,
  ) {}

  startAll() {
    if (!this.shouldManageServices) {
      return;
    }

    const serverProcess = this.spawnImpl("pnpm", ["--filter", "@learning-os/server", "dev"], {
      stdio: "inherit",
    });
    const generatorProcess = this.spawnImpl("python3.11", [
      "-m",
      "uvicorn",
      "learning_os_generator.api.app:app",
      "--app-dir",
      "apps/generator/src",
      "--host",
      "127.0.0.1",
      "--port",
      "8000",
    ], {
      stdio: "inherit",
    });

    this.processes.push(serverProcess, generatorProcess);
  }

  stopAll() {
    for (const process of this.processes.splice(0)) {
      process.kill?.("SIGTERM");
    }
  }
}

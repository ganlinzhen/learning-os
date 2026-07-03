import type { ChildProcess, SpawnOptions } from "node:child_process";
import type { RuntimeCommand } from "./runtime-paths.js";

type StartInput = {
  generator: RuntimeCommand;
  server: RuntimeCommand;
  healthChecks: string[];
  maxAttempts?: number;
  retryDelayMs?: number;
};

export class ServiceSupervisor {
  private readonly processes: ChildProcess[] = [];

  constructor(
    private readonly spawnImpl: (command: string, args: string[], options: SpawnOptions) => ChildProcess,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async start(input: StartInput) {
    this.processes.push(this.spawn(input.generator));
    this.processes.push(this.spawn(input.server));

    for (const healthCheck of input.healthChecks) {
      await this.waitForHealthy(healthCheck, input.maxAttempts ?? 20, input.retryDelayMs ?? 250);
    }
  }

  stop() {
    for (const process of this.processes.splice(0)) {
      process.kill?.("SIGTERM");
    }
  }

  private spawn(command: RuntimeCommand) {
    return this.spawnImpl(command.command, command.args, {
      cwd: command.cwd,
      env: { ...process.env, ...command.env },
      stdio: "inherit",
    });
  }

  private async waitForHealthy(url: string, maxAttempts: number, retryDelayMs: number) {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        const response = await this.fetchImpl(url);
        if (response.ok) {
          return;
        }
      } catch {
        // Ignore transient connection errors until retries are exhausted.
      }

      if (attempt < maxAttempts - 1) {
        await delay(retryDelayMs);
      }
    }

    throw new Error(`service_check_failed:${url}`);
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
